#!/usr/bin/env node
// calibrate-tagged.mjs — committed diagnostic (evidence, not a pipeline step).
// Attributes every "unsafe" answer (an out_of_scope question the gate SERVED) to its row type —
// construction (cross-tenant), near-domain (agent), or od-batch/owner — using the SAME per-tenant
// thresholds as GATE_CONFIGS (no threshold change), then recomputes two restricted tables:
// (i) construction-only OOS, (ii) construction + owner-verified rows. Run:
// `node tooling/corpus/calibrate-tagged.mjs`; output: calibrate-tagged-output.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cosineSimilarity } from '../../packages/vector-store/dist/cosine.js';
import { createEmbedder } from '../../packages/embedder/dist/embedder.js';
import { GATE_CONFIGS } from '../../packages/core/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const TENANTS = ['T01-platform-operations-style', 'T04-customer-support-style', 'T05-policy-style'];
const all = JSON.parse(readFileSync(resolve(here, 'questions.json'), 'utf8')).questions;
const embedder = await createEmbedder();
const BATCH = 32;
async function embedPassages(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    for (const v of await embedder.embedPassages(texts.slice(i, i + BATCH))) out.push(v);
  }
  return out;
}
function typ(q) {
  const i = q.id || '';
  if (i.startsWith('XO-')) return 'construction';
  if (i.startsWith('ND-')) return 'near-domain';
  if (i.startsWith('OD-')) return 'od-batch';
  return 'other';
}

const report = {};
for (const tenant of TENANTS) {
  const rung = JSON.parse(readFileSync(resolve(here, `rungs/${tenant}-500.json`), 'utf8'));
  const passages = rung.procedures.map((p) => `${p.title}\n${p.summary}`);
  const vectors = await embedPassages(passages);
  for (const split of ['calibration', 'held-out']) {
    const questions = all.filter(
      (q) => q.split === split && (q.slice === 'B' || q.title_echo !== true) && q.tenant === tenant,
    );
    const rows = [];
    for (const q of questions) {
      const qv = await embedder.embedQuery(q.text);
      let best = { s: -1, idx: -1 };
      for (let i = 0; i < vectors.length; i++) {
        const s = cosineSimilarity(qv, vectors[i]);
        if (s > best.s) best = { s, i };
      }
      const acceptable = new Set(q.acceptable_documents ?? []);
      const hit = best.idx >= 0 && acceptable.has(rung.procedures[best.idx].source_path);
      rows.push({ id: q.id, label: q.label, type: typ(q), top1: best.s, hit });
    }
    const oos = rows.filter((r) => r.label === 'out_of_scope');
    const thr = GATE_CONFIGS[tenant].thresholdAccept;
    const served = (r) => r.top1 >= thr;
    const unsafeAll = oos.filter(served).length;
    const byType = {};
    for (const t of ['construction', 'near-domain', 'od-batch', 'other']) {
      const sub = oos.filter((r) => r.type === t);
      byType[t] = { n: sub.length, unsafe: sub.filter(served).length };
    }
    const consOnly = oos.filter((r) => r.type === 'construction');
    const unsafeCons = consOnly.filter(served).length;
    const consOwner = oos.filter((r) => r.type === 'construction' || r.type === 'od-batch');
    const unsafeConsOwner = consOwner.filter(served).length;
    report[`${tenant}|${split}`] = {
      threshold: thr,
      oos_total: oos.length,
      unsafe_all: unsafeAll,
      byType,
      unsafe_construction_only: unsafeCons,
      unsafe_construction_plus_owner: unsafeConsOwner,
    };
  }
}
writeFileSync(resolve(here, 'calibrate-tagged-output.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
for (const k of Object.keys(report)) {
  const r = report[k];
  console.log(`\n${k}  thr=${r.threshold}  oos=${r.oos_total}  unsafe_all=${r.unsafe_all}`);
  for (const t of ['construction', 'near-domain', 'od-batch', 'other']) {
    const b = r.byType[t];
    console.log(`   ${t.padEnd(13)} n=${b.n}  unsafe=${b.unsafe}`);
  }
  console.log(`   (i) construction-only unsafe = ${r.unsafe_construction_only}`);
  console.log(`   (ii) construction+owner(unsafe) = ${r.unsafe_construction_plus_owner}`);
}
console.log('\nwrote calibrate-tagged-output.json');
