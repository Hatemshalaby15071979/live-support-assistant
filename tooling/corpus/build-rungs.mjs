#!/usr/bin/env node
/**
 * Build the Minimum Viable Rung and the 500-rung.
 *
 * A rung is a corpus of N procedures used to measure retrieval. Two rules from
 * the owner:
 *
 *   1. **Always include the gold answer documents.** Every procedure belonging to
 *      a document named as an acceptable answer must be in the rung, or the
 *      question is unanswerable by construction and the measurement is a lie.
 *   2. **Same-domain distractors only.** The fill comes from the same tenant, so
 *      the rung measures discrimination between related procedures rather than
 *      between obviously different ones. Cross-tenant padding is what V2 calls
 *      `easy-mode` and it is not used here.
 *
 * ## Why the smallest rung is called MVR, not 40
 *
 * V2 names a 40-procedure rung. It **cannot exist** under document-level labels:
 * a question's acceptable set is every procedure of a document, documents average
 * ~26 procedures, and T01 and T05 each have 123 gold procedures from their own
 * answer documents alone. A 40-rung would have to drop gold coverage, which would
 * make its questions unanswerable by construction and the resulting recall figure
 * meaningless.
 *
 * The owner adopted option (c) on 2026-10-07: replace the 40-rung with the
 * **Minimum Viable Rung** — the smallest corpus that holds every gold answer —
 * and register it alongside the 500-rung. The MVR is therefore a *derived*
 * quantity, different per tenant, and it is reported as such rather than
 * presented as a chosen size.
 *
 * The builder still refuses rather than trimming, so if a future change makes the
 * gold floor exceed 500 the 500-rung fails loudly too.
 *
 * Usage:
 *     node tooling/corpus/build-rungs.mjs
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const SEED = 20261007;
const TARGET_500 = 500;
const TENANTS = ['T01-platform-operations-style', 'T04-customer-support-style', 'T05-policy-style'];

const questions = JSON.parse(readFileSync(resolve(here, 'questions.json'), 'utf8')).questions;

/** Deterministic ordering key for a procedure id. */
function sampleKey(id) {
  return createHash('sha256').update(`${SEED}:${id}`, 'utf8').digest().readUInt32BE(0);
}

mkdirSync(resolve(here, 'rungs'), { recursive: true });

console.log('');
console.log('rungs');
console.log('');

let refusals = 0;
const report = [];

for (const tenant of TENANTS) {
  const corpus = JSON.parse(readFileSync(resolve(here, `tenants/${tenant}.json`), 'utf8'));

  // Gold documents for this tenant, from every row that names one.
  const goldDocuments = new Set();
  for (const question of questions) {
    if (question.tenant !== tenant) continue;
    for (const document of question.acceptable_documents ?? []) goldDocuments.add(document);
  }

  const gold = corpus.sops.filter((sop) => goldDocuments.has(sop.source_path));
  const rest = corpus.sops.filter((sop) => !goldDocuments.has(sop.source_path));

  // Fixed-seed ordering, so the fill is reproducible and independent of file order.
  const orderedRest = [...rest].sort((a, b) => sampleKey(a.id) - sampleKey(b.id));

  console.log(`  ${tenant}`);
  console.log(`    procedures total   ${corpus.sops.length}`);
  console.log(`    gold documents     ${goldDocuments.size}`);
  console.log(`    gold procedures    ${gold.length}   <- the floor for every rung`);
  console.log(`    distractors avail  ${rest.length}`);
  console.log(`    minimum viable rung ${gold.length}   <- no rung below this can hold the gold answers`);
  console.log('');

  // The MVR is derived, not chosen: it is whatever size holds every gold answer.
  const mvr = gold.length;
  const rungs = [...new Set([mvr, TARGET_500])].sort((a, b) => a - b);

  for (const size of rungs) {
    if (gold.length > size) {
      console.log(`    ${String(size).padStart(3)}-rung  REFUSED — ${gold.length} gold procedures exceed ${size}.`);
      console.log(`             The rung cannot hold the gold answers, and trimming them would make`);
      console.log(`             the questions unanswerable by construction.`);
      console.log('');
      refusals += 1;
      report.push({ tenant, rung: size, built: false, gold_procedures: gold.length, reason: 'gold exceeds rung size' });
      continue;
    }

    const kind = size === mvr ? 'MVR' : String(size);
    const fill = orderedRest.slice(0, size - gold.length);
    const procedures = [...gold, ...fill];

    const file = `rungs/${tenant}-${kind}.json`;
    writeFileSync(
      resolve(here, file),
      `${JSON.stringify({
        tenant,
        rung: kind,
        rung_size: size,
        seed: SEED,
        data_mode: 'web-sourced',
        note:
          size === mvr
            ? 'MINIMUM VIABLE RUNG. The smallest corpus that holds every gold answer document for this ' +
              'tenant, so no gold coverage is trimmed. Derived from the gold set, not chosen.'
            : 'Fixed-seed rung. Contains every procedure of every gold answer document for this tenant, ' +
              'plus same-domain distractors in a stable order. No cross-tenant padding.',
        gold_documents: [...goldDocuments].sort(),
        gold_procedures: gold.length,
        distractor_procedures: fill.length,
        procedures,
      }, null, 2)}\n`,
      'utf8',
    );

    console.log(`    ${kind.padStart(3)}-rung  built — ${gold.length} gold + ${fill.length} distractors = ${procedures.length}`);
    console.log(`             ${file}`);
    console.log('');
    report.push({ tenant, rung: size, built: true, gold_procedures: gold.length, distractors: fill.length, file });
  }
}

writeFileSync(resolve(here, 'rungs/index.json'), `${JSON.stringify({ seed: SEED, target_500: TARGET_500, report }, null, 2)}\n`, 'utf8');

console.log(`  refusals: ${refusals}`);
console.log('');
