#!/usr/bin/env node
/**
 * RX-03 calibration — retrieval quality only, run exactly per
 * `docs/prereg/rx03-retrieval-quality.md` (candidate frozen 2026-10-07).
 *
 * Compares the FROZEN CANDIDATE (`Xenova/multilingual-e5-small`) against the
 * INCUMBENT (`Xenova/all-MiniLM-L6-v2`) on the **calibration split only**:
 *   - R@1 / R@3 / R@5 (document-level hits, mirroring run-baseline.mjs exactly:
 *     passages are `${title}\n${summary}` from the existing 500-rungs; a hit at k
 *     is any top-k procedure whose source_path is in the row's acceptable set)
 *   - wrong-document rate at k (= 1 − R@k over the same group), printed beside
 *     every recall figure (V2 rule 9)
 *   - mean top-1 cosine
 *   - out_of_scope top-1 distribution — OBSERVED ONLY; the gate is not re-run and
 *     no threshold is applied or changed
 *   - T01 per-language arm: recorded NOT MEASURABLE — the gold rows carry no
 *     language metadata and all 20 answerable T01 rows accept only content/en/
 *     documents (measured, see results JSON)
 *
 * Headline population (V2 headline standard): clean Slice A (title_echo excluded)
 * + answerable Slice B, per tenant. Held-out split is never read. No gate change,
 * no reranker, no hybrid retrieval, no other model embedded.
 *
 * Usage: RX03_COMMIT=<sha> node tooling/retrieval/run-rx03-calibration.mjs
 * Output: tooling/retrieval/rx03-calibration.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cosineSimilarity } from '../../packages/vector-store/dist/cosine.js';
import { createEmbedder } from '../../packages/embedder/dist/embedder.js';
import { MINILM_L6_V2, E5_SMALL_MULTILINGUAL } from '../../packages/embedder/dist/model.js';
import { GATE_CONFIGS } from '../../packages/core/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = resolve(here, '../corpus');
const TENANTS = ['T01-platform-operations-style', 'T04-customer-support-style', 'T05-policy-style'];
const KS = [1, 3, 5];
const BATCH = 32;
const COMMIT = process.env.RX03_COMMIT ?? 'unrecorded';

const MODELS = [
  { role: 'incumbent', spec: MINILM_L6_V2 },
  { role: 'candidate', spec: E5_SMALL_MULTILINGUAL },
];

const questions = JSON.parse(readFileSync(resolve(corpusDir, 'questions.json'), 'utf8')).questions
  .filter((q) => q.split === 'calibration');

const results = {
  commit: COMMIT,
  generated_at: new Date().toISOString(),
  split: 'calibration',
  data_mode: 'calibration',
  models: MODELS.map((m) => ({ role: m.role, id: m.spec.id, revision: m.spec.revision, dtype: m.spec.dtype, dimensions: m.spec.dimensions })),
  tenants: {},
  t01_per_language: {
    status: 'NOT MEASURABLE',
    reason:
      'Gold rows carry no language metadata (0 "language" fields in questions.json) and all 20 ' +
      'answerable T01 rows accept only content/en/ documents (measured). The es/fr/pt-BR arm of the ' +
      'corpus cannot be probed by the current gold set; per-language RX-03 results need new gold rows, ' +
      'which is a gold-set change outside RX-03.',
  },
};

function groupMetrics(rows, kHits) {
  if (rows.length === 0) return null;
  const n = rows.length;
  const out = { n };
  for (const k of KS) {
    const hits = rows.filter((r) => r.hitAt[k]).length;
    out[`recall@${k}`] = Number((hits / n).toFixed(4));
    out[`wrongDoc@${k}`] = Number((1 - hits / n).toFixed(4));
  }
  out.meanTop1 = Number((rows.reduce((s, r) => s + r.top1, 0) / n).toFixed(4));
  return out;
}

function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return Number((sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)).toFixed(4));
}

const embedderCache = new Map();
async function getEmbedder(spec) {
  if (!embedderCache.has(spec.id)) {
    process.stdout.write(`loading ${spec.id} (revision ${spec.revision.slice(0, 10)}) ...\n`);
    embedderCache.set(spec.id, await createEmbedder(spec));
  }
  return embedderCache.get(spec.id);
}

for (const { role, spec } of MODELS) {
  const embedder = await getEmbedder(spec);
  results.tenants[role] = {};
  for (const tenant of TENANTS) {
    const rung = JSON.parse(readFileSync(resolve(corpusDir, `rungs/${tenant}-500.json`), 'utf8'));
    const passages = rung.procedures.map((p) => `${p.title}\n${p.summary}`);
    const vectors = [];
    for (let i = 0; i < passages.length; i += BATCH) {
      for (const v of await embedder.embedPassages(passages.slice(i, i + BATCH))) vectors.push(v);
    }

    const tenantQs = questions.filter((q) => q.tenant === tenant);
    const scored = [];
    for (const q of tenantQs) {
      const qv = await embedder.embedQuery(q.text);
      const ranked = vectors
        .map((vector, index) => ({ index, score: cosineSimilarity(qv, vector) }))
        .sort((a, b) => b.score - a.score);
      const acceptable = new Set(q.acceptable_documents ?? []);
      const top5 = ranked.slice(0, Math.max(...KS));
      scored.push({
        id: q.id, slice: q.slice, label: q.label, titleEcho: q.title_echo === true,
        top1: Number((ranked[0]?.score ?? 0).toFixed(6)),
        hitAt: Object.fromEntries(KS.map((k) => [k, top5.slice(0, k).some((e) => acceptable.has(rung.procedures[e.index].source_path))])),
      });
    }

    const aClean = scored.filter((s) => s.slice === 'A' && !s.titleEcho);
    const bAns = scored.filter((s) => s.slice === 'B' && s.label === 'answerable');
    const headline = [...aClean, ...bAns];
    const oos = scored.filter((s) => s.label === 'out_of_scope');
    const thr = GATE_CONFIGS?.[tenant]?.thresholdAccept; // observed-only marker
    const oosTop1 = oos.map((s) => s.top1).sort((a, b) => a - b);
    const observed = {
      oosN: oos.length,
      top1Distribution: {
        min: oosTop1[0] ?? null,
        p25: quantile(oosTop1, 0.25),
        median: quantile(oosTop1, 0.5),
        p75: quantile(oosTop1, 0.75),
        max: oosTop1[oosTop1.length - 1] ?? null,
      },
      note: 'OBSERVED ONLY — no gate re-run, no threshold applied or changed; the shipped thresholdAccept is reported for context against a different model and is not transferable.',
      shippedThresholdAcceptForContext: thr ?? null,
      oosAboveShippedThreshold: oosTop1.filter((s) => thr !== undefined && s >= thr).length,
    };

    results.tenants[role][tenant] = {
      data_mode: 'calibration',
      groups: {
        slice_a_clean: groupMetrics(aClean, KS),
        slice_b_answerable: groupMetrics(bAns, KS),
        headline_cleanA_plus_answerableB: groupMetrics(headline, KS),
      },
      out_of_scope_observed: observed,
    };
    const g = results.tenants[role][tenant].groups.headline_cleanA_plus_answerableB;
    process.stdout.write(`${role.padEnd(9)} ${tenant.slice(0, 3)}  headline n=${g.n}  R@1=${(g['recall@1'] * 100).toFixed(1)}% R@3=${(g['recall@3'] * 100).toFixed(1)}% R@5=${(g['recall@5'] * 100).toFixed(1)}%  wrongDoc@1=${(g['wrongDoc@1'] * 100).toFixed(1)}%  oosN=${observed.oosN} top1max=${observed.top1Distribution.max}\n`);
  }
}

// A1 verdict (calibration only): candidate R@1 improves on >= 2 of 3 tenants on the
// headline set, no tenant's R@1 drops more than 2 pp, wrongDoc@1 not worse anywhere.
const a1 = { perTenant: {} };
let improved = 0, disqualifying = [];
for (const tenant of TENANTS) {
  const inc = results.tenants.incumbent[tenant].groups.headline_cleanA_plus_answerableB;
  const cand = results.tenants.candidate[tenant].groups.headline_cleanA_plus_answerableB;
  const deltaPP = Number((((cand['recall@1'] - inc['recall@1']) * 100)).toFixed(2));
  const wrongDocDeltaPP = Number((((cand['wrongDoc@1'] - inc['wrongDoc@1']) * 100)).toFixed(2));
  const verdict = deltaPP > 0 ? 'improved' : deltaPP < 0 ? 'dropped' : 'unchanged';
  if (deltaPP > 0) improved++;
  if (deltaPP < -2) disqualifying.push(`${tenant}: R@1 ${deltaPP} pp`);
  if (wrongDocDeltaPP > 0) disqualifying.push(`${tenant}: wrongDoc@1 +${wrongDocDeltaPP} pp`);
  a1.perTenant[tenant] = {
    incumbentR1: inc['recall@1'], candidateR1: cand['recall@1'], deltaPP,
    incumbentWrongDoc1: inc['wrongDoc@1'], candidateWrongDoc1: cand['wrongDoc@1'],
    verdict,
  };
}
a1.improvedTenants = improved;
a1.disqualifiers = disqualifying;
a1.verdict = improved >= 2 && disqualifying.length === 0
  ? 'A1 MET on calibration — held-out validation may be requested'
  : 'A1 NOT MET on calibration — candidate fails the preregistered accept rule; rollback (discard candidate embeddings)';
results.a1_calibration = a1;

mkdirSync(here, { recursive: true });
writeFileSync(resolve(here, 'rx03-calibration.json'), `${JSON.stringify(results, null, 2)}\n`, 'utf8');
console.log(`\nA1 (calibration): improved ${improved}/3 tenants; disqualifiers: ${disqualifying.length === 0 ? 'none' : disqualifying.join('; ')}`);
console.log(`A1 verdict: ${a1.verdict}`);
console.log(`wrote rx03-calibration.json (commit ${COMMIT}, data_mode calibration)`);
