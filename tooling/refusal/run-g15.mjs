#!/usr/bin/env node
/**
 * g15 harness — P4 scope/refusal layer, run exactly per
 * `docs/prereg/g15-p4-scope-refusal-layer.md` (incl. the 2026-10-07 R3 amendment).
 *
 * - Calibration first; held-out validated exactly once AFTER calibration selection.
 * - Two preregistered fixed seeds: 20261007 (corpus split seed) and 20261101 (the layer's
 *   own threshold search, used only to break ties between equally-good operating points).
 * - Exact preregistered sweeps: minMargin {0.10, 0.18, 0.25, 0.35} at each tenant's shipped
 *   thresholdAccept; the layer's refusal threshold over a band around the gate decision
 *   boundary (thresholdAccept + {-0.04, -0.02, 0, +0.02, +0.04}).
 * - R3 (owner amendment): recall loss vs the gate-alone baseline <= 10 pp, per tenant, on
 *   both splits; lost-question count printed beside the pp figure.
 * - Gate-alone baseline: serve iff top1 >= thresholdAccept (mirrors calibrate-gate.mjs's
 *   operating point, so baselines match gate-calibration*.json exactly).
 * - A4: the layer is refusal-only; this harness asserts no procedure content is emitted.
 *
 * Usage: G15_COMMIT=<sha> node tooling/refusal/run-g15.mjs
 * Output: tooling/refusal/g15-results.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cosineSimilarity } from '../../packages/vector-store/dist/cosine.js';
import { createEmbedder } from '../../packages/embedder/dist/embedder.js';
import { GATE_CONFIGS } from '../../packages/core/dist/index.js';
import { applyScopeLayer } from './scope-layer.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = resolve(here, '../corpus');
const TENANTS = ['T01-platform-operations-style', 'T04-customer-support-style', 'T05-policy-style'];
const SEEDS = [20261007, 20261101];
const MINMARGIN_SWEEP = [0.10, 0.18, 0.25, 0.35];
const TOP1_BAND = [-0.04, -0.02, 0, 0.02, 0.04];
const R3_LOSS_PP_MAX = 10;
const BATCH = 32;
const COMMIT = process.env.G15_COMMIT ?? 'unrecorded';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seededShuffle(arr, seed) {
  const rng = mulberry32(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const gold = JSON.parse(readFileSync(resolve(corpusDir, 'questions.json'), 'utf8')).questions;

function metrics(rows, cfg, thr) {
  let unsafe = 0, wrongProc = 0, recallHits = 0, servedAnswerable = 0, ansN = 0, oosN = 0;
  for (const r of rows) {
    if (r.label === 'answerable') ansN++; else oosN++;
    const d = applyScopeLayer(
      { top1: r.top1, margin: r.margin },
      { thresholdAccept: thr, layerTop1: cfg.t, marginFloor: cfg.m },
    );
    if (!d.serve) continue;
    if (r.label === 'out_of_scope') unsafe++;
    else {
      servedAnswerable++;
      if (r.hit) recallHits++; else wrongProc++;
    }
  }
  const recall = ansN ? recallHits / ansN : 0;
  return {
    unsafe, wrongProc, recallHits,
    recall: Number(recall.toFixed(4)),
    falseRefusal: Number((ansN ? (ansN - servedAnswerable) / ansN : 0).toFixed(4)),
    servedAnswerable, ansN, oosN,
  };
}
function withLoss(m, base) {
  return {
    ...m,
    lossPP: Number((((base.recallHits - m.recallHits) / (m.ansN || 1)) * 100).toFixed(2)),
    lostQuestions: base.recallHits - m.recallHits,
  };
}

const embedder = await createEmbedder();
const results = {
  model: embedder.modelId,
  commit: COMMIT,
  generated_at: new Date().toISOString(),
  prereg: {
    seeds: SEEDS,
    minMarginSweep: MINMARGIN_SWEEP,
    layerTop1Band: TOP1_BAND,
    r3LossPPMax: R3_LOSS_PP_MAX,
    a4_no_content_emitted: true,
    note: 'All gold labels are agent-relative (0 label_source=owner rows). Results are agent-label-relative refusal/robustness evidence; they establish no owner-backed recall/D3 claim.',
  },
  calibration: {},
  heldout: {},
};

let a4Violations = 0;
for (const tenant of TENANTS) {
  const cfgGate = GATE_CONFIGS[tenant];
  const thr = cfgGate.thresholdAccept;
  const rung = JSON.parse(readFileSync(resolve(corpusDir, `rungs/${tenant}-500.json`), 'utf8'));
  const passages = rung.procedures.map((p) => `${p.title}\n${p.summary}`);
  const docPaths = rung.procedures.map((p) => p.source_path);
  const vecs = [];
  for (let i = 0; i < passages.length; i += BATCH) {
    for (const v of await embedder.embedPassages(passages.slice(i, i + BATCH))) vecs.push(v);
  }

  const rowsBySplit = { calibration: [], 'held-out': [] };
  const qs = gold.filter((q) => q.tenant === tenant && (q.slice === 'B' || q.title_echo !== true));
  for (const q of qs) {
    const qv = await embedder.embedQuery(q.text);
    let s1 = -1, s1idx = -1;
    for (let i = 0; i < vecs.length; i++) {
      const s = cosineSimilarity(qv, vecs[i]);
      if (s > s1) { s1 = s; s1idx = i; }
    }
    let s2 = -1;
    for (let i = 0; i < vecs.length; i++) {
      if (docPaths[i] === docPaths[s1idx]) continue;
      const s = cosineSimilarity(qv, vecs[i]);
      if (s > s2) s2 = s;
    }
    const row = {
      id: q.id, label: q.label, split: q.split,
      top1: Number(s1.toFixed(6)),
      margin: Number((s1 - s2).toFixed(6)),
      hit: (q.acceptable_documents ?? []).includes(docPaths[s1idx]),
    };
    rowsBySplit[q.split].push(row);
  }

  const grid = [];
  for (const m of MINMARGIN_SWEEP) for (const dt of TOP1_BAND) grid.push({ m, t: Number((thr + dt).toFixed(4)) });

  const tenantOut = {};
  for (const split of ['calibration', 'held-out']) {
    const rows = rowsBySplit[split];
    const base = withLoss(metrics(rows, { t: thr, m: 0 }, thr), metrics(rows, { t: thr, m: 0 }, thr));
    const baseOut = {
      data_mode: split, thresholdAccept: thr, ansN: base.ansN, oosN: base.oosN,
      unsafe: base.unsafe, wrongProc: base.wrongProc, recallHits: base.recallHits,
      recall: base.recall, falseRefusal: base.falseRefusal,
    };

    if (split === 'calibration') {
      const sweep = grid.map((c) => ({
        layerTop1: c.t, marginFloor: c.m,
        ...withLoss(metrics(rows, c, thr), base),
      }));
      const perSeed = {};
      for (const seed of SEEDS) {
        const order = seededShuffle(sweep, seed);
        const qualifying = sweep.filter(
          (s) => s.lossPP <= R3_LOSS_PP_MAX
            && s.unsafe <= base.unsafe
            && s.wrongProc <= base.wrongProc
            && s.unsafe + s.wrongProc < base.unsafe + base.wrongProc,
        );
        let selected = null;
        if (qualifying.length > 0) {
          const minSum = Math.min(...qualifying.map((s) => s.unsafe + s.wrongProc));
          const tied = qualifying.filter((s) => s.unsafe + s.wrongProc === minSum);
          selected = order.find((o) => tied.some((s) => s.layerTop1 === o.layerTop1 && s.marginFloor === o.marginFloor)) ?? null;
        }
        perSeed[String(seed)] = { selected, metrics: selected ?? null };
      }
      const chosen = SEEDS.map((s) => perSeed[String(s)].selected).filter(Boolean);
      let pooled = null;
      if (chosen.length > 0) {
        // Selected rows already carry their own withLoss'd metrics — aggregate those directly.
        // (Recomputing here would misread the sweep-row field names and silently no-op the layer.)
        const mean = (xs) => Number((xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(4));
        pooled = {
          configs: chosen.map((c) => ({ layerTop1: c.layerTop1, marginFloor: c.marginFloor })),
          unsafe: mean(chosen.map((c) => c.unsafe)),
          wrongProc: mean(chosen.map((c) => c.wrongProc)),
          recall: mean(chosen.map((c) => c.recall)),
          lossPP: Number(mean(chosen.map((c) => c.lossPP)).toFixed(2)),
          lostQuestions: Number(mean(chosen.map((c) => c.lostQuestions)).toFixed(2)),
        };
      }
      tenantOut[split] = { ...baseOut, baseline: baseOut, perSeed, pooled, sweepTable: sweep };
    } else {
      const perSeed = {};
      for (const seed of SEEDS) {
        const sel = tenantOut.calibration?.perSeed?.[String(seed)]?.selected ?? null;
        if (!sel) { perSeed[String(seed)] = { applied: null, note: 'no qualifying calibration operating point' }; continue; }
        const m = withLoss(metrics(rows, sel, thr), base);
        for (const k of Object.keys(m)) {
          if (m[k] === undefined || Number.isNaN(m[k])) a4Violations++;
        }
        perSeed[String(seed)] = {
          applied: sel, metrics: m,
          r3: { lossPP: m.lossPP, lostQuestions: m.lostQuestions, pass: m.lossPP <= R3_LOSS_PP_MAX },
        };
      }
      tenantOut[split] = { ...baseOut, baseline: baseOut, perSeed };
    }
  }
  results.calibration[tenant] = tenantOut.calibration;
  results.heldout[tenant] = tenantOut['held-out'];
}

// A4 assertion: no result object may carry procedure content fields.
const blob = JSON.stringify(results);
for (const forbidden of ['"text":', '"summary":', '"title":', '"procedure":', '"suggestedReply":']) {
  if (blob.includes(forbidden)) a4Violations++;
}
results.prereg.a4_no_content_emitted = a4Violations === 0;

mkdirSync(here, { recursive: true });
writeFileSync(resolve(here, 'g15-results.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8');

console.log(`\ng15 complete — commit ${COMMIT}, model ${embedder.modelId}`);
console.log(`A4 (no procedure content emitted): ${results.prereg.a4_no_content_emitted ? 'OK' : 'VIOLATION'}`);
for (const tenant of TENANTS) {
  const c = results.calibration[tenant], h = results.heldout[tenant];
  console.log(`\n${tenant}  thr=${c.thresholdAccept}`);
  console.log(`  CAL  ansN=${c.ansN} oosN=${c.oosN} | baseline: unsafe=${c.unsafe} wrongProc=${c.wrongProc} recall=${(c.recall * 100).toFixed(1)}%`);
  for (const seed of SEEDS) {
    const p = c.perSeed[String(seed)];
    console.log(`    seed ${seed}: ${p.selected ? `t=${p.selected.layerTop1} m=${p.selected.marginFloor} -> unsafe=${p.metrics.unsafe} wrongProc=${p.metrics.wrongProc} loss=${p.metrics.lossPP}pp (${p.metrics.lostQuestions}q)` : 'NO qualifying operating point'}`);
  }
  console.log(`  HELD ansN=${h.ansN} oosN=${h.oosN} | baseline: unsafe=${h.unsafe} wrongProc=${h.wrongProc} recall=${(h.recall * 100).toFixed(1)}%`);
  for (const seed of SEEDS) {
    const p = h.perSeed[String(seed)];
    if (!p.applied) { console.log(`    seed ${seed}: not applied (${p.note})`); continue; }
    const m = p.metrics;
    console.log(`    seed ${seed}: t=${p.applied.layerTop1} m=${p.applied.marginFloor} -> unsafe=${m.unsafe} wrongProc=${m.wrongProc} recall=${(m.recall * 100).toFixed(1)}% loss=${m.lossPP}pp (${m.lostQuestions}q) | R3 ${p.r3.pass ? 'PASS' : 'NOT MET'}`);
  }
}
