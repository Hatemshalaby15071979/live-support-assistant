#!/usr/bin/env node
/**
 * The P1 exit gate.
 *
 * Asserts what the corpus manifest claims, by re-deriving it rather than reading
 * it. A manifest is a statement of intent; this is the check that the statement
 * is true.
 *
 * The checks, and why each is a check rather than a comment:
 *
 *   1. **Provenance is complete.** Every harvested source names its licence, the
 *      URL the licence was read from, when, and what the file said. A source
 *      missing any of those cannot be attributed, and an unattributable corpus
 *      cannot be published to a tenant.
 *   2. **The licence is allowlisted.** Re-checked here, not trusted from the
 *      manifest, so a hand-edited manifest does not launder a licence.
 *   3. **The snapshot exists and hashes to what the manifest says.** This is what
 *      makes the snapshot an artifact rather than a claim: if the bytes changed,
 *      the name changes, and a mismatch means something edited it in place.
 *   4. **Counts match.** `items` in the manifest equals the items actually in the
 *      snapshot. A count is the cheapest thing to let drift and the most
 *      misleading when it does.
 *   5. **Nothing unquarantined carries personal data.** Every item is re-scanned.
 *      The privacy gate ran at harvest time; this proves the result survived.
 *   6. **Every question row is labelled and originated**, and the split files
 *      exist.
 *
 * A missing artifact is a failure, not a warning. The gate exists to answer "is
 * P1 done", and "the gold set has not been built yet" is a no.
 *
 * Usage:
 *   node tooling/corpus/verify-corpus.mjs --manifest tooling/corpus/manifest.json
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkLicence, loadAllowlist } from './licence-gate.mjs';
import { scanForPii } from './pii-gate.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const manifestFlag = args.indexOf('--manifest');
const manifestPath = resolve(
  process.cwd(),
  manifestFlag === -1 ? resolve(here, 'manifest.json') : args[manifestFlag + 1],
);

const failures = [];
const warnings = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

function note(message) {
  notes.push(message);
}

if (!existsSync(manifestPath)) {
  process.stderr.write(`no manifest at ${manifestPath}\n`);
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const allowlist = loadAllowlist();

if (manifest.data_mode !== 'web-sourced') {
  fail(`manifest data_mode is "${manifest.data_mode}", expected "web-sourced"`);
}

const sources = manifest.sources ?? [];
const harvested = sources.filter((entry) => entry.status === 'harvested');

note(`sources: ${sources.length} registered, ${harvested.length} harvested`);

if (harvested.length === 0) {
  fail('no source harvested, so there is no corpus to verify');
}

// ---------------------------------------------------------------------------
// 1-5: per-source provenance, licence, snapshot, counts, privacy
// ---------------------------------------------------------------------------

const PROVENANCE_FIELDS = [
  'licence',
  'licence_url',
  'licence_read_at',
  'attribution',
  'repo',
  'ref',
  'path',
  'language',
  'tenant',
];

let totalItems = 0;
const byLanguage = {};
const byTenant = {};

for (const source of harvested) {
  const label = source.id;

  for (const field of PROVENANCE_FIELDS) {
    const value = source[field];
    if (typeof value !== 'string' || value.trim() === '') {
      fail(`${label}: provenance field "${field}" is missing or empty`);
    }
  }

  // A revision must be a commit sha, not a branch. `main` would re-pin the corpus
  // under a manifest that still claims the old one.
  if (typeof source.ref !== 'string' || !/^[0-9a-f]{40}$/.test(source.ref)) {
    fail(`${label}: ref "${source.ref}" is not a 40-character commit sha`);
  }

  const licence = checkLicence(source.licence, allowlist);
  if (!licence.allowed) {
    fail(`${label}: licence "${source.licence}" is not allowed — ${licence.reason}`);
  }

  if (source.redistribute_text === true && licence.allowed && licence.entry.attribution_required !== true) {
    warnings.push(`${label}: text is redistributed but the licence does not require attribution`);
  }

  const snapshotPath = resolve(here, source.snapshot ?? '');

  if (typeof source.snapshot !== 'string' || !existsSync(snapshotPath)) {
    fail(`${label}: snapshot file "${source.snapshot}" is missing`);
    continue;
  }

  const raw = readFileSync(snapshotPath, 'utf8');
  const actualSha = createHash('sha256').update(raw, 'utf8').digest('hex');

  if (actualSha !== source.snapshotSha256) {
    fail(
      `${label}: snapshot hash mismatch — manifest says ${String(source.snapshotSha256).slice(0, 12)}, ` +
        `the file hashes to ${actualSha.slice(0, 12)}. The snapshot was modified in place.`,
    );
  }

  const snapshot = JSON.parse(raw);

  if (snapshot.sourceId !== source.id) {
    fail(`${label}: snapshot names source "${snapshot.sourceId}"`);
  }

  if (snapshot.ref !== source.ref) {
    fail(`${label}: snapshot ref ${String(snapshot.ref).slice(0, 12)} does not match the manifest's ${source.ref.slice(0, 12)}`);
  }

  if (Array.isArray(snapshot.items) === false) {
    fail(`${label}: snapshot carries no items array`);
    continue;
  }

  if (snapshot.items.length !== source.items) {
    fail(`${label}: manifest declares ${source.items} item(s), the snapshot holds ${snapshot.items.length}`);
  }

  totalItems += snapshot.items.length;
  byLanguage[source.language] = (byLanguage[source.language] ?? 0) + snapshot.items.length;
  byTenant[source.tenant] = (byTenant[source.tenant] ?? 0) + snapshot.items.length;

  // Re-scan every item. The gate ran at harvest time; this proves the result
  // survived whatever happened to the file since.
  let dirty = 0;
  for (const item of snapshot.items) {
    if (typeof item.text !== 'string' || item.text.trim() === '') {
      fail(`${label}: an item has no text (${item.path})`);
      continue;
    }
    const scan = scanForPii(item.text);
    if (!scan.clean) {
      dirty += 1;
      if (dirty <= 3) {
        fail(
          `${label}: item ${item.path} carries personal data (${scan.findings
            .map((finding) => finding.pattern)
            .join(', ')})`,
        );
      }
    }
  }
  if (dirty > 3) {
    fail(`${label}: ${dirty} items carry personal data in total`);
  }
}

// ---------------------------------------------------------------------------
// 6: question sets
// ---------------------------------------------------------------------------

const questionsPath = resolve(here, 'questions.json');

if (!existsSync(questionsPath)) {
  fail(
    'questions.json is missing. P1 requires a gold set of 150-300 questions per primary ' +
      'tenant per rung, split calibration / held-out on a fixed seed, with every row carrying ' +
      'origin and label_source.',
  );
} else {
  const questions = JSON.parse(readFileSync(questionsPath, 'utf8'));
  const rows = questions.questions ?? [];

  if (rows.length === 0) {
    fail('questions.json carries no questions');
  }

  // The allowed values, extended on the owner's instruction 2026-10-07.
  //
  // `owner-directed-draft` is a distinct origin from `owner` and the distinction
  // is load-bearing: it means the owner chose the topic but the wording was
  // drafted, so the row is NOT a real customer question and must never be
  // described as one. Collapsing it into `owner` would lose exactly that fact.
  // `derived-style` means the row was written in the style of the owner's
  // queries without being one.
  const ORIGINS = ['owner', 'public', 'derived-paraphrase', 'owner-directed-draft', 'derived-style'];
  // Provenance vocabulary = how the label was produced (V2 rule 7). This is an integrity check,
  // not an authority check: accepting a value grants no evidence authority. Authority semantics
  // live in PRODUCTION_SAAS_PROGRAM_V2.md rule 7.
  const LABEL_SOURCES = ['owner', 'agent-full-text', 'agent-agreed', 'agent', 'agent-single', 'construction'];

  for (const [index, row] of rows.entries()) {
    if (!ORIGINS.includes(row.origin)) {
      fail(`question ${index}: origin "${row.origin}" is not one of ${ORIGINS.join(', ')}`);
    }
    if (!LABEL_SOURCES.includes(row.label_source)) {
      fail(`question ${index}: label_source "${row.label_source}" is not one of ${LABEL_SOURCES.join(', ')}`);
    }
    if (typeof row.text !== 'string' || row.text.trim() === '') {
      fail(`question ${index}: no text`);
    }
  }

  for (const file of questions.splits ?? []) {
    if (!existsSync(resolve(here, file))) {
      fail(`split file "${file}" is missing`);
    }
  }

  note(`questions: ${rows.length} row(s)`);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

process.stdout.write('\ncorpus verification\n');
process.stdout.write(`  manifest : ${manifestPath}\n`);
process.stdout.write(`  sources  : ${harvested.length} harvested, ${sources.length - harvested.length} not\n`);
process.stdout.write(`  items    : ${totalItems}\n`);
process.stdout.write(`  language : ${Object.entries(byLanguage).map(([k, v]) => `${k} ${v}`).join(', ') || '(none)'}\n`);
process.stdout.write(`  tenant   : ${Object.entries(byTenant).map(([k, v]) => `${k} ${v}`).join(', ') || '(none)'}\n`);

for (const message of notes) process.stdout.write(`  note     : ${message}\n`);
for (const message of warnings) process.stdout.write(`  warning  : ${message}\n`);

if (failures.length > 0) {
  process.stdout.write('\n');
  for (const message of failures) process.stdout.write(`  FAIL  ${message}\n`);
}

process.stdout.write(`\nfailures: ${failures.length}\n\n`);
process.stdout.write(failures.length === 0 ? 'CORPUS VERIFICATION OK\n' : 'CORPUS VERIFICATION FAILED\n');

process.exit(failures.length === 0 ? 0 : 1);
