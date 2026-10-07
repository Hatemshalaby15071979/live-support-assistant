#!/usr/bin/env node
/**
 * Confidence-gate calibration on a chosen split.
 *
 * The gate decides whether a retrieved answer is served or refused. Its input is
 * the top-1 cosine similarity: above the threshold the answer is served, below it
 * the system refuses and escalates.
 *
 * ## The four outcomes, and which one is the dangerous one
 *
 *   TP  answerable, served, and the top-1 is the right document
 *   FN  answerable, refused  — a **false refusal**, the user gets nothing
 *   FP  served but wrong, or served for an `out_of_scope` question — a **false answer**
 *   TN  `out_of_scope`, refused — correct behaviour
 *
 * **A false answer is not the same severity as a false refusal.** A refusal is
 * visible, recoverable and honest; a wrong answer to a question the corpus cannot
 * answer is the failure the whole confidence gate exists to prevent. So the
 * **unsafe count** (FP on `out_of_scope`) is reported as its own column and is
 * not folded into precision.
 *
 * ## Per tenant, not pooled
 *
 * Thresholds are per tenant, per V2 P3. Pooling would let a tenant with a large
 * question set set the threshold for a tenant with a small one, and the corpora
 * have different similarity scales — T05's policy documents score systematically
 * higher than T04's.
 *
 * ## Split selection
 *
 * The split is chosen by the `GATE_SPLIT` environment variable: `calibration`
 * (default) for tuning, `held-out` for the V2 D1 validation. Tuning on held-out
 * would make the held-out figure meaningless, so the operating point is read from
 * `GATE_CONFIGS`, never re-derived here.
 *
 * Usage:
 *     node tooling/corpus/calibrate-gate.mjs                # calibration split
 *     GATE_SPLIT=held-out node tooling/corpus/calibrate-gate.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cosineSimilarity } from '../../packages/vector-store/dist/cosine.js';
import { createEmbedder } from '../../packages/embedder/dist/embedder.js';
import { GATE_CONFIGS } from '../../packages/core/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));

const TENANTS = ['T01-platform-operations-style', 'T04-customer-support-style', 'T05-policy-style'];
const SPLIT = process.env.GATE_SPLIT === 'held-out' ? 'held-out' : 'calibration';

// 0.40-0.52 in 0.02 steps as requested, plus 0.53 because that is the threshold
// selected for T04 and it must appear in the same table as the range it was
// chosen from rather than being quoted from a separate scan.
const THRESHOLDS = [];
for (let t = 0.4; t <= 0.5201; t += 0.02) THRESHOLDS.push(Number(t.toFixed(2)));
THRESHOLDS.push(0.53);

const BATCH = 32;

const all = JSON.parse(readFileSync(resolve(here, 'questions.json'), 'utf8')).questions;
// Headline standard: clean Slice A and answerable Slice B only. Title-echo rows
// are excluded because they are easy by construction and would flatter the gate.
const questions = all.filter(
  (q) => q.split === SPLIT && (q.slice === 'B' || q.title_echo !== true),
);

const embedder = await createEmbedder();

async function embedPassages(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    for (const vector of await embedder.embedPassages(texts.slice(i, i + BATCH))) out.push(vector);
  }
  return out;
}

/** Per-threshold metrics for a tenant, using top-1 >= threshold as the served test. */
function metricsAt(answerable, outOfScope, threshold) {
  const served = (row) => row.top1 >= threshold;
  const tp = answerable.filter((r) => served(r) && r.hit).length;
  const wrongServed = answerable.filter((r) => served(r) && !r.hit).length;
  const refused = answerable.filter((r) => !served(r)).length;
  const unsafe = outOfScope.filter((r) => served(r)).length;
  const fp = wrongServed + unsafe;
  return {
    threshold,
    tp,
    fp,
    fn: refused,
    unsafe_answers: unsafe,
    precision: tp + fp === 0 ? null : tp / (tp + fp),
    recall: answerable.length === 0 ? null : tp / answerable.length,
    false_refusal_rate: answerable.length === 0 ? null : refused / answerable.length,
  };
}

const report = {
  model: embedder.modelId,
  split: SPLIT,
  data_mode: SPLIT,
  thresholds: THRESHOLDS,
  tenants: {},
};

for (const tenant of TENANTS) {
  const rung = JSON.parse(readFileSync(resolve(here, `rungs/${tenant}-500.json`), 'utf8'));
  const passages = rung.procedures.map((p) => `${p.title}\n${p.summary}`);
  const vectors = await embedPassages(passages);

  const rows = [];
  for (const question of questions.filter((q) => q.tenant === tenant)) {
    const queryVector = await embedder.embedQuery(question.text);
    let best = { score: -1, index: -1 };
    for (let i = 0; i < vectors.length; i += 1) {
      const score = cosineSimilarity(queryVector, vectors[i]);
      if (score > best.score) best = { score, index: i };
    }
    const acceptable = new Set(question.acceptable_documents ?? []);
    rows.push({
      id: question.id,
      label: question.label,
      slice: question.slice,
      top1: best.score,
      hit: best.index >= 0 && acceptable.has(rung.procedures[best.index].source_path),
    });
  }

  const answerable = rows.filter((r) => r.label === 'answerable');
  const outOfScope = rows.filter((r) => r.label === 'out_of_scope');

  const table = THRESHOLDS.map((threshold) => metricsAt(answerable, outOfScope, threshold));

  // Operating point at the tenant's calibrated threshold (read from GATE_CONFIGS,
  // never derived here — that is the whole point of held-out validation).
  const opThreshold = GATE_CONFIGS[tenant].thresholdAccept;
  const operatingPoint = metricsAt(answerable, outOfScope, opThreshold);

  report.tenants[tenant] = {
    rung: 500,
    split: SPLIT,
    answerable: answerable.length,
    out_of_scope: outOfScope.length,
    operatingThreshold: opThreshold,
    operatingPoint,
    table,
  };

  // The requested range is 0.40-0.52 (the explicit 0.53 is reported separately,
  // not as part of the range). The label must reflect only that range, otherwise
  // it reads "YES" while the printed 0.52 row still shows unsafe > 0.
  if (outOfScope.length > 0) {
    const extended = [];
    for (let t = 0.4; t <= 0.9001; t += 0.01) {
      const threshold = Number(t.toFixed(2));
      const unsafe = outOfScope.filter((r) => r.top1 >= threshold).length;
      const refused = answerable.filter((r) => r.top1 < threshold).length;
      extended.push({ threshold, unsafe, false_refusals: refused });
    }
    const zeroUnsafe = extended.find((entry) => entry.unsafe === 0);
    report.tenants[tenant].zero_unsafe_threshold = zeroUnsafe ?? null;
    report.tenants[tenant].in_range_zero_unsafe = table
      .filter((row) => row.threshold <= 0.52)
      .some((row) => row.unsafe_answers === 0);
    report.tenants[tenant].max_out_of_scope_top1 = Math.max(...outOfScope.map((r) => r.top1));
  }

  const pct = (v) => (v === null ? '   n/a' : `${(v * 100).toFixed(1)}%`.padStart(6));
  console.log('');
  console.log(`  ${tenant}  500-rung  ${SPLIT} split (data_mode=${SPLIT})`);
  console.log(`    answerable ${answerable.length}   out_of_scope ${outOfScope.length}`);
  console.log(`    ${'thr'.padStart(5)} ${'TP'.padStart(3)} ${'FP'.padStart(3)} ${'FN'.padStart(3)} ${'unsafe'.padStart(6)}  ${'prec'.padStart(6)} ${'recall'.padStart(6)} ${'falseRef'.padStart(8)}`);
  for (const row of table) {
    console.log(
      `    ${row.threshold.toFixed(2).padStart(5)} ${String(row.tp).padStart(3)} ${String(row.fp).padStart(3)} ` +
        `${String(row.fn).padStart(3)} ${String(row.unsafe_answers).padStart(6)}  ` +
        `${pct(row.precision)} ${pct(row.recall)} ${pct(row.false_refusal_rate)}`,
    );
  }

  console.log('');
  console.log(`    operating point @ ${opThreshold.toFixed(2)} (GATE_CONFIGS[${tenant}])`);
  console.log(
    `      TP ${operatingPoint.tp}  FP ${operatingPoint.fp}  FN ${operatingPoint.fn}  ` +
      `unsafe ${operatingPoint.unsafe_answers}  prec ${pct(operatingPoint.precision)}  ` +
      `recall ${pct(operatingPoint.recall)}  falseRef ${pct(operatingPoint.false_refusal_rate)}`,
  );

  if (outOfScope.length > 0) {
    const inRange = report.tenants[tenant].in_range_zero_unsafe;
    console.log('');
    console.log(`    zero-unsafe in 0.40-0.52? ${inRange ? 'YES' : 'NO'}`);
    console.log(`    highest out_of_scope top-1 ${report.tenants[tenant].max_out_of_scope_top1.toFixed(4)}`);
    const z = report.tenants[tenant].zero_unsafe_threshold;
    console.log(
      z === null
        ? '    no threshold up to 0.90 reaches zero unsafe answers'
        : `    zero-unsafe at threshold ${z.threshold.toFixed(2)} — costing ${z.false_refusals} false refusal(s) of ${answerable.length} answerable`,
    );
  }
}

const outFile = SPLIT === 'held-out' ? 'gate-calibration-heldout.json' : 'gate-calibration.json';
writeFileSync(resolve(here, outFile), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log('');
console.log(`model ${embedder.modelId} — wrote ${outFile} (split=${SPLIT})`);
console.log('');
