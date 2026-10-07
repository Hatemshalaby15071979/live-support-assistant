#!/usr/bin/env node
/**
 * Slice A — questions in the documents' own register.
 *
 * ## THIS APPROACH FAILED. Kept as a documented negative result.
 *
 * The first run generated 134 rows from 136 T04 documents and was **reverted
 * without being committed**, because reading the output showed three failures at
 * once:
 *
 *   1. **It is one template, not a set.** 117 of 134 rows opened with "tell me
 *      about"; four distinct openings across the whole slice.
 *   2. **The questions are not in the documents' register.** 103 of 134 rows
 *      share **zero** 3-grams with the document they are labelled against. Slice
 *      A exists to share vocabulary; this shares none.
 *   3. **The grammar breaks on verb-phrase filenames.** `converting-a-user-into-
 *      an-organization` produced "tell me about a user into an organization";
 *      `creating-an-account-on-github` produced "tell me about an account on
 *      github".
 *
 * **And the leakage control is what caused failure 2, which is the useful
 * finding.** The control rejects a question whose 3-grams echo the title and
 * first sentence — and a question genuinely in the document's register is
 * *exactly* the one that echoes. The two requirements pull against each other:
 * every on-register candidate was rejected, leaving only the off-register ones.
 * The mean leakage of the survivors was 0.053, which should have been the alarm
 * before the questions were read.
 *
 * **The conclusion is that Slice A cannot be generated this way.** A question
 * that shares the document's vocabulary and is also a natural question has to be
 * *written*, by an agent reading the document, not assembled from a filename by
 * a template. That is a larger and slower job, and it is the correct one. The
 * template approach is retained here so the next attempt does not repeat it.
 *
 * ## The original intent, for the record
 *
 * The owner's register C asks for two slices:
 *
 *   **Slice A** shares vocabulary with the document. It establishes a ceiling
 *   that is easy to hit and proves the pipeline works.
 *   **Slice B** is user-voiced and does not share vocabulary. It is the number
 *   that matters, because a support assistant meets user-voiced queries and the
 *   corpus it is given is rarely written in the same register.
 *
 * ## The leakage control
 *
 * V2 §P1 requires it: the 3-gram overlap between the question and the document's
 * title and first sentence must be <= 0.30, and `derived-paraphrase` rows are
 * reported separately and never in a headline. The control below is correct and
 * worth keeping even though the generator around it is not.
 *
 * ## No model
 *
 * Generation is deterministic string work. No inference, no network call, no API.
 *
 * Usage:
 *     node tooling/corpus/build-slice-a.mjs
 *     node tooling/corpus/build-slice-a.mjs --tenant T05-policy-style
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** V2 §P1: 3-gram overlap with the document title and first sentence, <= 0.30. */
const LEAKAGE_LIMIT = 0.30;

/** V2 §P1 asks for 150-300 questions per primary tenant per rung. */
const TARGET_MIN = 150;
const TARGET_MAX = 300;

const args = process.argv.slice(2);

// This generator produced a slice that was reverted without being committed. It
// stays in the tree as a documented negative result and as the home of the
// leakage control, but running it writes a known-bad slice over questions.json,
// so it refuses unless the operator says they know that.
if (!args.includes('--i-know-this-approach-failed')) {
  console.error('');
  console.error('REFUSING TO RUN.');
  console.error('');
  console.error('This generator produced a Slice A that was reverted without being committed:');
  console.error('117 of 134 rows shared one template, and 103 of 134 shared zero 3-grams with');
  console.error('the document they were labelled against. The leakage control rejected every');
  console.error('on-register candidate, leaving only the off-register ones.');
  console.error('');
  console.error('Read the header of this file, then pass --i-know-this-approach-failed to run it.');
  console.error('');
  process.exit(3);
}

const tenantFlag = args.indexOf('--tenant');
const TENANT = tenantFlag === -1 ? 'T04-customer-support-style' : args[tenantFlag + 1];

// ---------------------------------------------------------------------------
// The leakage control.
// ---------------------------------------------------------------------------

/**
 * Word 3-grams of a string, lowercased and stripped of punctuation.
 *
 * @param {string} text
 * @returns {Set<string>}
 */
function trigrams(text) {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word !== '');

  const out = new Set();
  for (let index = 0; index + 2 < words.length; index += 1) {
    out.add(`${words[index]} ${words[index + 1]} ${words[index + 2]}`);
  }
  return out;
}

/**
 * Fraction of the question's 3-grams that also appear in the reference.
 *
 * Directional on purpose: the question is the thing that must not echo. A long
 * document contains most trigrams by accident, so measuring the other way would
 * report a high overlap for every question regardless of how it was written.
 *
 * @param {string} question
 * @param {string} reference
 */
function leakage(question, reference) {
  const questionTrigrams = trigrams(question);
  if (questionTrigrams.size === 0) return 1;
  const referenceTrigrams = trigrams(reference);

  let shared = 0;
  for (const trigram of questionTrigrams) if (referenceTrigrams.has(trigram)) shared += 1;
  return shared / questionTrigrams.size;
}

// ---------------------------------------------------------------------------
// Deterministic generation.
// ---------------------------------------------------------------------------

/** `configure-pod-configmap.md` -> `configure pod configmap` */
function topicFromPath(path) {
  const stem = path.split('/').slice(-1)[0].replace(/\.[a-z]+$/, '');
  return stem.replace(/[-_]/g, ' ');
}

/**
 * Leading verbs dropped so the stem becomes a noun phrase the templates can
 * carry. Filenames are a mix of `account management` (already a noun phrase) and
 * `manage payment info` (a verb phrase), and a template that reads well for one
 * reads as nonsense for the other — the first attempt produced
 * "how do i account management".
 *
 * This is a cosmetic fix to a cosmetic problem and it does not make the slice
 * natural. Deterministic generation over filenames produces formulaic questions,
 * and that is a property of the method rather than a defect to be hidden: Slice
 * A's value is the ceiling it establishes, not its realism. Slice B is the
 * realistic one.
 */
const LEADING_VERBS = new Set([
  'manage', 'managing', 'changing', 'configure', 'configuring', 'create', 'creating',
  'set', 'setting', 'add', 'adding', 'view', 'viewing', 'use', 'using', 'download',
  'downloading', 'upload', 'uploading', 'sync', 'syncing', 'cancel', 'cancelling',
  'upgrade', 'upgrading', 'downgrade', 'downgrading', 'enable', 'enabling', 'disable',
  'disabling', 'delete', 'deleting', 'remove', 'removing', 'edit', 'editing', 'update',
  'updating', 'connect', 'connecting', 'redeem', 'redeeming', 'request', 'requesting',
  'blocking', 'block', 'merge', 'merging', 'moving', 'move', 'convert', 'converting',
]);

function nounPhrase(topic) {
  const words = topic.split(' ');
  if (words.length > 1 && LEADING_VERBS.has(words[0])) return words.slice(1).join(' ');
  return topic;
}

/**
 * Interrogative templates. Deliberately few, and all noun-phrase carriers so they
 * read the same way for `username changes` and `payment info`. A larger template
 * set would produce variety without producing *different questions*, and every
 * template has to survive the leakage control against the document it came from.
 */
const TEMPLATES = [
  (topic) => `tell me about ${topic}`,
  (topic) => `what do i need to know about ${topic}`,
  (topic) => `explain ${topic}`,
];

/**
 * Build one question per (document, template), rejecting anything that echoes.
 *
 * @param {{source_path: string, title: string, summary: string}} procedure
 */
function generate(procedure) {
  const topic = nounPhrase(topicFromPath(procedure.source_path));
  const reference = `${procedure.title} ${procedure.summary.split('\n\n')[0]}`;

  const candidates = [];
  const rejected = [];

  for (const template of TEMPLATES) {
    const question = template(topic);
    const score = leakage(question, reference);
    if (score <= LEAKAGE_LIMIT) {
      candidates.push({ question, score });
    } else {
      rejected.push({ question, score });
    }
  }

  return { candidates, rejected };
}

// ---------------------------------------------------------------------------

const corpus = JSON.parse(readFileSync(resolve(here, `tenants/${TENANT}.json`), 'utf8'));

// One question set per *document*, not per procedure — the label is
// document-level, and generating from every passage would produce the same
// question many times over.
/** @type {Map<string, {source_path: string, title: string, summary: string}>} */
const byDocument = new Map();
for (const procedure of corpus.sops) {
  if (!byDocument.has(procedure.source_path)) byDocument.set(procedure.source_path, procedure);
}

const rows = [];
const allRejected = [];
let documentsWithNoQuestion = 0;

for (const [path, procedure] of byDocument) {
  const { candidates, rejected } = generate(procedure);
  allRejected.push(...rejected.map((entry) => ({ ...entry, path })));

  if (candidates.length === 0) {
    documentsWithNoQuestion += 1;
    continue;
  }

  // One question per document keeps the set from being padded with near
  // duplicates of itself, and the highest-scoring-under-the-limit candidate is
  // the one that shares the most vocabulary while still passing.
  const chosen = candidates.sort((left, right) => right.score - left.score)[0];

  rows.push({
    id: `SA-${String(rows.length + 1).padStart(3, '0')}`,
    text: chosen.question,
    tenant: TENANT,
    slice: 'A',
    origin: 'derived-paraphrase',
    data_mode: 'web-sourced',
    // The document the question was derived from is the answer by construction.
    // `agent-agreed` records that the derivation source and the answerability
    // check agreed, not that a human judged it.
    label_source: 'agent-agreed',
    label_basis: 'derivation-source',
    label: 'answerable',
    confidence: 'high',
    acceptable_documents: [path],
    leakage_3gram: Number(chosen.score.toFixed(4)),
    reasoning: 'Derived from this document; the document is the answer by construction. Leakage control applied at <= 0.30.',
    split: null,
  });
}

// Cap at the V2 ceiling, deterministically.
const capped = rows.slice(0, TARGET_MAX);

// ---------------------------------------------------------------------------
// Merge into questions.json, leaving the Slice B rows untouched.
// ---------------------------------------------------------------------------

const questionsPath = resolve(here, 'questions.json');
const existing = JSON.parse(readFileSync(questionsPath, 'utf8'));
const existingA = existing.questions.filter((row) => row.slice === 'A');
const sliceB = existing.questions.filter((row) => row.slice === 'B');

// Deterministic split, same scheme as Slice B: a hash of the row id, so adding a
// row never re-splits the others.
const { createHash } = await import('node:crypto');
const SEED = existing.seed ?? 20261007;
const CALIBRATION_FRACTION = existing.calibration_fraction ?? 0.7;

for (const row of capped) {
  const digest = createHash('sha256').update(`${SEED}:${row.id}`, 'utf8').digest();
  row.split = digest.readUInt32BE(0) / 0x100000000 < CALIBRATION_FRACTION ? 'calibration' : 'held-out';
}

const merged = {
  ...existing,
  note:
    'Gold set. Every row carries origin, label_source, data_mode and slice. Labels are at DOCUMENT ' +
    'level. Slice A rows are derived from their source document and carry a 3-gram leakage control ' +
    '(<= 0.30) per V2 §P1; they are reported separately and NEVER in a headline.',
  questions: [...sliceB, ...capped],
};

writeFileSync(questionsPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');

// ---------------------------------------------------------------------------

const calibration = capped.filter((row) => row.split === 'calibration').length;
const scores = capped.map((row) => row.leakage_3gram);
const mean = scores.reduce((sum, value) => sum + value, 0) / (scores.length || 1);

console.log('');
console.log(`SLICE A — ${TENANT}`);
console.log('');
console.log(`  documents considered        ${byDocument.size}`);
console.log(`  questions generated         ${capped.length}`);
console.log(`  documents that produced none ${documentsWithNoQuestion}`);
console.log(`  candidates rejected by the leakage control ${allRejected.length}`);
console.log('');
console.log(`  leakage limit               ${LEAKAGE_LIMIT}`);
console.log(`  leakage mean                ${mean.toFixed(4)}`);
console.log(`  leakage max                 ${Math.max(...scores).toFixed(4)}`);
console.log('');
console.log(`  split                       ${calibration} calibration / ${capped.length - calibration} held-out`);
console.log('');
console.log(`  slice B rows preserved      ${sliceB.length} (unchanged, written back in the same order)`);
console.log(`  previous slice A rows replaced ${existingA.length}`);
console.log('');
if (TARGET_MIN > capped.length) {
  console.log(`  BELOW the V2 range of ${TARGET_MIN}-${TARGET_MAX}: ${capped.length} rows.`);
  console.log('');
}
