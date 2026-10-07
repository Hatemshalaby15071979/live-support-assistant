#!/usr/bin/env node
/**
 * Confidence-gate calibration on the calibration split.
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
 * ## Calibration split only
 *
 * The held-out split is not read by this script. Tuning a threshold on held-out
 * data is how a held-out figure stops meaning anything.
 *
 * Usage:
 *     node tooling/corpus/calibrate-gate.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cosineSimilarity } from '../../packages/vector-store/dist/cosine.js';
import { createEmbedder } from '../../packages/embedder/dist/embedder.js';

const here = dirname(fileURLToPath(import.meta.url));

const TENANTS = ['T01-platform-operations-style', 'T04-customer-support-style', 'T05-policy-style'];
const THRESHOLDS = [];
for (let t = 0.4; t <= 0.5201; t += 0.02) THRESHOLDS.push(Number(t.toFixed(2)));

const BATCH = 32;

const all = JSON.parse(readFileSync(resolve(here, 'questions.json'), 'utf8')).questions;
// Headline standard: clean Slice A and answerable Slice B only. Title-echo rows
// are excluded because they are easy by construction and would flatter the gate.
const questions = all.filter(
  (q) => q.split === 'calibration' && (q.slice === 'B' || q.title_echo !== true),
);

const embedder = await createEmbedder();

async function embedPassages(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    for (const vector of await embedder.embedPassages(texts.slice(i, i + BATCH))) out.push(vector);
  }
  return out;
}

const report = { model: embedder.modelId, split: 'calibration', thresholds: THRESHOLDS, tenants: {} };

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

  const table = THRESHOLDS.map((threshold) => {
    const served = (row) => row.top1 >= threshold;

    const tp = answerable.filter((r) => served(r) && r.hit).length;
    const wrongServed = answerable.filter((r) => served(r) && !r.hit).length;
    const refused = answerable.filter((r) => !served(r)).length;
    const unsafe = outOfScope.filter((r) => served(r)).length;
    const correctRefusal = outOfScope.filter((r) => !served(r)).length;

    const fp = wrongServed + unsafe;
    return {
      threshold,
      tp,
      fp,
      false_refusals: refused,
      unsafe_answers: unsafe,
      correct_refusals: correctRefusal,
      precision: tp + fp === 0 ? null : tp / (tp + fp),
      recall: answerable.length === 0 ? null : tp / answerable.length,
      false_refusal_rate: answerable.length === 0 ? null : refused / answerable.length,
      refusal_accuracy: outOfScope.length === 0 ? null : correctRefusal / outOfScope.length,
    };
  });

  report.tenants[tenant] = {
    rung: 500,
    answerable: answerable.length,
    out_of_scope: outOfScope.length,
    table,
  };

  // The requested range is 0.40-0.52. If no threshold in it reaches zero unsafe
  // answers — V2 D1's requirement — the honest report is to say so AND to find
  // where zero-unsafe actually is, so the reader knows the distance rather than
  // only the failure.
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
    report.tenants[tenant].in_range_zero_unsafe = table.some((row) => row.unsafe_answers === 0);
    report.tenants[tenant].max_out_of_scope_top1 = Math.max(...outOfScope.map((r) => r.top1));
  }

  const pct = (v) => (v === null ? '   n/a' : `${(v * 100).toFixed(1)}%`.padStart(6));
  console.log('');
  console.log(`  ${tenant}  500-rung  calibration split`);
  console.log(`    answerable ${answerable.length}   out_of_scope ${outOfScope.length}`);
  console.log(`    ${'thr'.padStart(5)} ${'TP'.padStart(3)} ${'FP'.padStart(3)} ${'FN'.padStart(3)} ${'unsafe'.padStart(6)}  ${'prec'.padStart(6)} ${'recall'.padStart(6)} ${'falseRef'.padStart(8)}`);
  for (const row of table) {
    console.log(
      `    ${row.threshold.toFixed(2).padStart(5)} ${String(row.tp).padStart(3)} ${String(row.fp).padStart(3)} ` +
        `${String(row.false_refusals).padStart(3)} ${String(row.unsafe_answers).padStart(6)}  ` +
        `${pct(row.precision)} ${pct(row.recall)} ${pct(row.false_refusal_rate)}`,
    );
  }

  if (outOfScope.length > 0) {
    const z = report.tenants[tenant].zero_unsafe_threshold;
    const inRange = report.tenants[tenant].in_range_zero_unsafe;
    console.log('');
    console.log(`    zero-unsafe in 0.40-0.52? ${inRange ? 'YES' : 'NO'}`);
    console.log(`    highest out_of_scope top-1 ${report.tenants[tenant].max_out_of_scope_top1.toFixed(4)}`);
    console.log(
      z === null
        ? '    no threshold up to 0.90 reaches zero unsafe answers'
        : `    zero-unsafe at threshold ${z.threshold.toFixed(2)} — costing ${z.false_refusals} false refusal(s) of ${answerable.length} answerable`,
    );
  }
}

writeFileSync(resolve(here, 'gate-calibration.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log('');
console.log(`model ${embedder.modelId} — wrote gate-calibration.json`);
console.log('');
