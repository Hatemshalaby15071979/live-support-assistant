#!/usr/bin/env node
/**
 * First retrieval baseline: recall@k over the MVR and 500-rungs.
 *
 * ## What is being measured
 *
 * For each question, the retriever returns the top-k procedures. A question is a
 * **hit at k** when any of those procedures belongs to a document the question's
 * label names as an acceptable answer. Labels are document-level, so the
 * acceptable set is every procedure of every named document.
 *
 * ## `out_of_scope` rows are not scored for recall, and that is deliberate
 *
 * There is no correct document to retrieve, so "recall" is undefined for them.
 * Reporting 0% would say the retriever failed when the retriever has nothing to
 * find, and reporting them as hits would be worse. They are reported by their
 * **top-1 similarity** instead — the signal a confidence gate would act on — so
 * the question "would this have been refused?" is answerable separately.
 *
 * ## The two breakdowns the owner asked for
 *
 *   - **Slice A, clean vs title_echo.** Slice A rows whose 3-gram overlap with
 *     their own document's title and first sentence exceeds 0.30 are title-echo
 *     rows. They are easy by construction, they stay in `questions.json`, and
 *     **they must not enter a headline**. Splitting them out is what makes that
 *     possible without deleting them.
 *   - **Slice B, answerable vs out_of_scope.** The refusal surface.
 *
 * ## What this baseline is
 *
 * The shipped bi-encoder (`Xenova/all-MiniLM-L6-v2`) with no reranker and no
 * confidence gate — the retrieval half only. It says nothing about whether an
 * answer would have been *served*; that needs the margin gate and is a later
 * measurement.
 *
 * Usage:
 *     node tooling/corpus/run-baseline.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cosineSimilarity } from '../../packages/vector-store/dist/cosine.js';
import { createEmbedder } from '../../packages/embedder/dist/embedder.js';

const here = dirname(fileURLToPath(import.meta.url));

const TENANTS = ['T01-platform-operations-style', 'T04-customer-support-style', 'T05-policy-style'];
const KS = [1, 3, 5];
const BATCH = 32;

const questions = JSON.parse(readFileSync(resolve(here, 'questions.json'), 'utf8')).questions;

const embedder = await createEmbedder();

/** Embed passages in batches, so 500 procedures do not arrive as one call. */
async function embedPassages(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const vectors = await embedder.embedPassages(slice);
    for (const vector of vectors) out.push(vector);
  }
  return out;
}

/** @param {number[]} values */
function mean(values) {
  return values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
}

const results = [];

for (const tenant of TENANTS) {
  const tenantQuestions = questions.filter((question) => question.tenant === tenant);

  for (const rungKind of ['MVR', '500']) {
    const rung = JSON.parse(readFileSync(resolve(here, `rungs/${tenant}-${rungKind}.json`), 'utf8'));
    const passages = rung.procedures.map((procedure) => `${procedure.title}\n${procedure.summary}`);
    const passageVectors = await embedPassages(passages);

    const scored = [];
    for (const question of tenantQuestions) {
      const queryVector = await embedder.embedQuery(question.text);
      const ranked = passageVectors
        .map((vector, index) => ({ index, score: cosineSimilarity(queryVector, vector) }))
        .sort((left, right) => right.score - left.score);

      const top = ranked.slice(0, Math.max(...KS));
      const acceptable = new Set(question.acceptable_documents ?? []);

      scored.push({
        question,
        top1: ranked[0]?.score ?? 0,
        hitAt: Object.fromEntries(
          KS.map((k) => [k, top.slice(0, k).some((entry) => acceptable.has(rung.procedures[entry.index].source_path))]),
        ),
        topPath: ranked[0] === undefined ? null : rung.procedures[ranked[0].index].source_path,
      });
    }

    /** @param {(q: any) => boolean} predicate */
    const summarise = (predicate) => {
      const subset = scored.filter((entry) => predicate(entry.question));
      if (subset.length === 0) return null;
      return {
        n: subset.length,
        recall: Object.fromEntries(KS.map((k) => [k, mean(subset.map((entry) => (entry.hitAt[k] ? 1 : 0)))])),
        mean_top1: mean(subset.map((entry) => entry.top1)),
      };
    };

    const record = {
      tenant,
      rung: rungKind,
      rung_size: rung.rung_size ?? rung.procedures.length,
      gold_procedures: rung.gold_procedures,
      questions: tenantQuestions.length,
      slice_a_clean: summarise((q) => q.slice === 'A' && q.title_echo !== true),
      slice_a_title_echo: summarise((q) => q.slice === 'A' && q.title_echo === true),
      slice_b_answerable: summarise((q) => q.slice === 'B' && q.label === 'answerable'),
      // No correct document exists, so recall is UNDEFINED for these rows, not
      // zero. Printing 0.0% would say the retriever failed at a task it was never
      // given; the top-1 similarity is the number that means something.
      //
      // `summarise` returns null when the subset is empty — a tenant with no
      // Slice B rows has no out_of_scope group at all — so the spread has to be
      // guarded or it produces a partial object and the printer dereferences
      // `mean_top1` on undefined.
      slice_b_out_of_scope: (() => {
        const base = summarise((q) => q.slice === 'B' && q.label === 'out_of_scope');
        return base === null ? null : { ...base, recall_undefined: true };
      })(),
      slice_a_all: summarise((q) => q.slice === 'A'),
      all_answerable: summarise((q) => q.label === 'answerable'),
    };

    results.push(record);

    const pct = (value) => (value === null ? '  n/a' : `${(value * 100).toFixed(1)}%`.padStart(6));
    console.log('');
    console.log(`  ${tenant}  ${rungKind}  (${record.rung_size} procedures, ${record.questions} questions)`);
    console.log(`    ${'group'.padEnd(26)} ${'n'.padStart(3)}  ${'R@1'.padStart(6)} ${'R@3'.padStart(6)} ${'R@5'.padStart(6)}  top1`);
    for (const [name, group] of Object.entries({
      'A clean': record.slice_a_clean,
      'A title-echo': record.slice_a_title_echo,
      'A all': record.slice_a_all,
      'B answerable': record.slice_b_answerable,
      'B out_of_scope': record.slice_b_out_of_scope,
    })) {
      if (group === null) continue;
      const cells = group.recall_undefined
        ? `   ${'—'.padStart(6)} ${'—'.padStart(6)} ${'—'.padStart(6)}`
        : `${pct(group.recall[1])} ${pct(group.recall[3])} ${pct(group.recall[5])}`;
      const note = group.recall_undefined ? '   (recall undefined — no correct document)' : '';
      console.log(`    ${name.padEnd(26)} ${String(group.n).padStart(3)}  ${cells}  ${group.mean_top1.toFixed(3)}${note}`);
    }
  }
}

const report = {
  note:
    'First retrieval baseline. Shipped bi-encoder (Xenova/all-MiniLM-L6-v2), no reranker, no confidence ' +
    'gate. Document-level labels: a hit is any top-k procedure belonging to a named acceptable document. ' +
    'out_of_scope rows have no correct document and are reported by top-1 similarity, not recall.',
  model: embedder.modelId,
  ks: KS,
  results,
};

writeFileSync(resolve(here, 'baseline-results.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log('');
console.log(`model ${embedder.modelId} — wrote baseline-results.json`);
console.log('');
