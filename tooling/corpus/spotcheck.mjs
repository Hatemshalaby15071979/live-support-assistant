#!/usr/bin/env node
/**
 * Emit an owner spot-check batch.
 *
 * The owner is the only genuinely independent labeller in this pipeline. Both
 * labelling passes were run by the same agent, so their agreement measures
 * whether two *methods* agree, not whether the labels are right. This is the
 * check that catches a wrong label, and it is the reason the batch exists.
 *
 * A batch is 20 rows, ordered so the rows most likely to be wrong come first:
 *
 *   1. the owner-supplied rows, so the owner sees the labels for their own
 *      questions before anything else
 *   2. `agent-single` labels — one pass matched, the other did not
 *   3. `medium` confidence
 *   4. the rest, by row id
 *
 * The ordering is deliberate. A batch that leads with the easy rows spends the
 * owner's attention on the labels that were never in doubt.
 *
 * Usage:
 *     node tooling/corpus/spotcheck.mjs                 # first batch
 *     node tooling/corpus/spotcheck.mjs --batch 2       # second batch
 *     node tooling/corpus/spotcheck.mjs --batch 1 --json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BATCH_SIZE = 20;

const args = process.argv.slice(2);
const batchFlag = args.indexOf('--batch');
const batchNumber = batchFlag === -1 ? 1 : Number(args[batchFlag + 1]);
const asJson = args.includes('--json');

const questions = JSON.parse(readFileSync(resolve(here, 'questions.json'), 'utf8')).questions;

/** Rank: lower is reviewed first. */
function rank(question) {
  const ownerSupplied = question.origin === 'owner-directed-draft' ? 0 : 1;
  const singlePass = question.label_source === 'agent-single' ? 0 : 1;
  const medium = question.confidence === 'medium' ? 0 : 1;
  return [ownerSupplied, singlePass, medium, question.id];
}

const ordered = [...questions].sort((left, right) => {
  const a = rank(left);
  const b = rank(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] < b[index]) return -1;
    if (a[index] > b[index]) return 1;
  }
  return 0;
});

const start = (batchNumber - 1) * BATCH_SIZE;
const batch = ordered.slice(start, start + BATCH_SIZE);

if (batch.length === 0) {
  console.error(`batch ${batchNumber} is empty — the set has ${ordered.length} row(s)`);
  process.exit(2);
}

const payload = {
  note:
    'Owner spot-check batch. For each row: is the label right, and if the row is answerable, is the ' +
    'named document the one that answers it? Mark AGREE or DISAGREE. A disagreement is the most ' +
    'valuable output of this batch — it is the only thing that can find a wrong label.',
  batch: batchNumber,
  batch_size: batch.length,
  total_rows: ordered.length,
  accept_threshold: 0.85,
  rows: batch.map((question) => ({
    id: question.id,
    question: question.text,
    tenant: question.tenant,
    slice: question.slice,
    proposed_label: question.label,
    proposed_documents: question.acceptable_documents,
    confidence: question.confidence,
    label_source: question.label_source,
    split: question.split,
    your_verdict: '',
    your_note: '',
  })),
};

if (asJson) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
} else {
  console.log('');
  console.log(`SPOT-CHECK BATCH ${batchNumber}  —  ${batch.length} of ${ordered.length} rows`);
  console.log('');
  console.log('HOW TO REVIEW (about 12-18 minutes for 20 rows)');
  console.log('');
  console.log('  1. Read the question. Decide: does the T04 corpus answer it at all?');
  console.log('     If it does not, the right label is out_of_scope, and refusing is the correct behaviour.');
  console.log('  2. If it does, is the named document the one that answers it?');
  console.log('  3. Write AGREE or DISAGREE next to each row. Add a note when you disagree.');
  console.log('  4. Send the batch back. Anything you mark DISAGREE is relabelled or excluded.');
  console.log('');
  console.log(`  Acceptance: ${'85'}% of rows AGREE. Below that, the labelling protocol is re-run.`);
  console.log('');
  console.log('  Rows are ordered most-likely-wrong first: your own rows, then single-pass labels,');
  console.log('  then medium confidence. If you are short on time, stop after the first ten.');
  console.log('');

  for (const [index, row] of payload.rows.entries()) {
    console.log(`${String(start + index + 1).padStart(2)}. [${row.id}]  ${row.slice}  ${row.split}  conf=${row.confidence}  (${row.label_source})`);
    console.log(`    Q: ${row.question}`);
    if (row.proposed_label === 'out_of_scope') {
      console.log('    PROPOSED: out_of_scope — no document answers this, so refusing is correct');
    } else {
      console.log(`    PROPOSED: ${row.proposed_label}`);
      for (const document of row.proposed_documents) console.log(`      -> ${document}`);
    }
    console.log('    VERDICT: ______________');
    console.log('');
  }
}

const out = resolve(here, `spotcheck-batch-${batchNumber}.json`);
writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`wrote ${out}`);
console.log('');
