#!/usr/bin/env node
/**
 * Build the 40 and 500 rungs.
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
 * ## The constraint this exposes
 *
 * Rule 1 is a floor on the rung size, and the floor can exceed N. When the gold
 * answer documents contribute more procedures than the rung can hold, the rung
 * **cannot be built as specified** — and the honest output is a refusal with the
 * count, not a silently trimmed rung that drops gold coverage. The script prints
 * the floor for every tenant and rung so the constraint is visible before
 * anything is generated.
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
const RUNGS = [40, 500];
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

  for (const size of RUNGS) {
    if (gold.length > size) {
      console.log(`    ${String(size).padStart(3)}-rung  REFUSED — ${gold.length} gold procedures exceed ${size}.`);
      console.log(`             The rung cannot hold the gold answers, and trimming them would make`);
      console.log(`             the questions unanswerable by construction.`);
      console.log('');
      refusals += 1;
      report.push({ tenant, rung: size, built: false, gold_procedures: gold.length, reason: 'gold exceeds rung size' });
      continue;
    }

    const fill = orderedRest.slice(0, size - gold.length);
    const procedures = [...gold, ...fill];

    const file = `rungs/${tenant}-${size}.json`;
    writeFileSync(
      resolve(here, file),
      `${JSON.stringify({
        tenant,
        rung: size,
        seed: SEED,
        data_mode: 'web-sourced',
        note:
          'Fixed-seed rung. Contains every procedure of every gold answer document for this tenant, ' +
          'plus same-domain distractors in a stable order. No cross-tenant padding.',
        gold_documents: [...goldDocuments].sort(),
        gold_procedures: gold.length,
        distractor_procedures: fill.length,
        procedures,
      }, null, 2)}\n`,
      'utf8',
    );

    console.log(`    ${String(size).padStart(3)}-rung  built — ${gold.length} gold + ${fill.length} distractors = ${procedures.length}`);
    console.log(`             ${file}`);
    console.log('');
    report.push({ tenant, rung: size, built: true, gold_procedures: gold.length, distractors: fill.length, file });
  }
}

writeFileSync(resolve(here, 'rungs/index.json'), `${JSON.stringify({ seed: SEED, rungs: RUNGS, report }, null, 2)}\n`, 'utf8');

console.log(`  refusals: ${refusals}`);
console.log('');
