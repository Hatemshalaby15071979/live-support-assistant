#!/usr/bin/env node
/**
 * Assemble `questions.json` — the gold set.
 *
 * Every row carries `origin`, `label_source`, `data_mode` and `slice`, as the
 * owner requires. Labels are at **document level**: the acceptable set is every
 * procedure of the labelled document(s), and a hit is a retrieved procedure in
 * that set. That is the owner's instruction and it is the right unit here — a
 * harvested document is a whole task page, and asking which *passage* answers a
 * question would measure the passage splitter rather than retrieval.
 *
 * The split is fixed-seed and assigned **after** labelling, per the owner's
 * instruction, and the gold answer documents are always included in both rungs.
 *
 * Usage:
 *     node tooling/corpus/build-questions.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const SEED = 20261007;
const SPLIT_CALIBRATION = 0.7;

const ownerRows = JSON.parse(readFileSync(resolve(here, 'slice-b-owner-rows.json'), 'utf8'));
const labels = JSON.parse(readFileSync(resolve(here, 'slice-b-owner-labels.json'), 'utf8'));
const labelsById = new Map(labels.rows.map((row) => [row.id, row]));

/**
 * Deterministic 0..1 from a string.
 *
 * SHA-256, not FNV-1a, and the first attempt is why. FNV-1a over ids that differ
 * in one character — `OD-01`, `OD-02`, … — produces values that move together,
 * and the first split put **all fifteen rows in calibration and none in
 * held-out**. A split with nothing on one side is not a split, and it would have
 * been easy to miss because the counts looked plausible until they were read.
 *
 * A seeded PRNG would be the other obvious choice and is still the wrong one:
 * the split has to be stable when a row is added, and a PRNG's output depends on
 * how many rows came before it. Hashing the row id means inserting a row never
 * re-splits the others.
 *
 * @param {string} value
 */
function unitHash(value) {
  const digest = createHash('sha256').update(value, 'utf8').digest();
  return digest.readUInt32BE(0) / 0x100000000;
}

const questions = [];

for (const row of ownerRows.rows) {
  const label = labelsById.get(row.id);
  if (label === undefined) throw new Error(`no label for ${row.id}`);

  questions.push({
    id: row.id,
    text: row.text,
    tenant: ownerRows.tenant,
    slice: 'B',
    origin: 'owner-directed-draft',
    data_mode: 'simulated',
    label_source: label.label_source,
    label: label.label,
    confidence: label.confidence,
    acceptable_documents: label.documents,
    reasoning: label.reasoning,
    split: unitHash(`${SEED}:${row.id}`) < SPLIT_CALIBRATION ? 'calibration' : 'held-out',
  });
}

const counts = {
  total: questions.length,
  answerable: questions.filter((question) => question.label === 'answerable').length,
  out_of_scope: questions.filter((question) => question.label === 'out_of_scope').length,
  calibration: questions.filter((question) => question.split === 'calibration').length,
  held_out: questions.filter((question) => question.split === 'held-out').length,
  agent_agreed: questions.filter((question) => question.label_source === 'agent-agreed').length,
  agent_single: questions.filter((question) => question.label_source === 'agent-single').length,
};

const output = {
  note:
    'Gold set. Every row carries origin, label_source, data_mode and slice. Labels are at DOCUMENT ' +
    'level: acceptable_documents names the source document(s) that contain the answer, and a hit is a ' +
    'retrieved procedure belonging to one of them. The split is a fixed-seed hash of the row id, not a ' +
    'PRNG, so adding a row never re-splits the others.',
  seed: SEED,
  calibration_fraction: SPLIT_CALIBRATION,
  owner_wording_note:
    'The OD- rows are owner-directed drafts: topics chosen by the owner, wording drafted by Claude. ' +
    'They are NOT real customer questions and must never be described as such.',
  counts,
  questions,
};

writeFileSync(resolve(here, 'questions.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');

console.log('');
console.log('questions.json');
console.log('');
console.log(`  rows            ${counts.total}`);
console.log(`  answerable      ${counts.answerable}`);
console.log(`  out_of_scope    ${counts.out_of_scope}   (refusal cases)`);
console.log(`  agent-agreed    ${counts.agent_agreed}`);
console.log(`  agent-single    ${counts.agent_single}`);
console.log(`  calibration     ${counts.calibration}`);
console.log(`  held-out        ${counts.held_out}`);
console.log('');
console.log(`  seed            ${SEED}`);
console.log('');
