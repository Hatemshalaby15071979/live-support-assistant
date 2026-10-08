#!/usr/bin/env node
/**
 * Assemble `questions.json` from every question source.
 *
 * Sources, in the order they appear in the output:
 *   - `slice-b-owner-rows.json` + `slice-b-owner-labels.json` — the 15 owner-supplied rows
 *   - `slice-b-expansion.json` — 20 agent-authored user-voiced rows
 *   - `slice-a.json` + `slice-a-t05-expansion.json` — authored corpus-voiced rows
 *   - `slice-b-refusal-surface.json` — 16 agent-labelled refusal rows (T01, T05)
 *   - `slice-c-cross-tenant-oos.json` — OOS rows constructed from other tenants' answerable
 *     questions (g14 slice i; `label_source = construction`, `easy_mode = true`)
 *   - `slice-d-near-domain-oos.json` — agent-authored near-domain OOS, `queued_spot_check = true` (g14 slice ii)
 *
 * ## What it refuses to do
 *
 * **It verifies every document path against the tenant corpus and fails on a
 * miss.** A label naming a document that does not exist is worse than no label:
 * it makes the row unscoreable while looking complete, and the retrieval run
 * would report a miss that is really a typo.
 *
 * ## Leakage
 *
 * Slice A rows carry a computed 3-gram overlap with the document's title and
 * first sentence. It is **reported, not applied** — see `slice-a.json` for why it
 * cannot be a filter.
 *
 * Usage:
 *     node tooling/corpus/assemble-questions.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const SEED = 20261007;
const CALIBRATION_FRACTION = 0.7;
const LEAKAGE_LIMIT = 0.30;

const read = (name) => JSON.parse(readFileSync(resolve(here, name), 'utf8'));

const ownerRows = read('slice-b-owner-rows.json');
const ownerLabels = read('slice-b-owner-labels.json');
const expansion = read('slice-b-expansion.json');
const sliceA = read('slice-a.json');
const sliceAT05 = read('slice-a-t05-expansion.json');
const refusalSurface = read('slice-b-refusal-surface.json');
const crossTenant = read('slice-c-cross-tenant-oos.json');
const nearDomain = read('slice-d-near-domain-oos.json');
const multilingual = read('slice-b-multilingual.json');

/** Every document path per tenant, for verification. */
const tenantDocuments = new Map();
for (const tenant of ['T01-platform-operations-style', 'T04-customer-support-style', 'T05-policy-style']) {
  const corpus = read(`tenants/${tenant}.json`);
  tenantDocuments.set(tenant, new Set(corpus.sops.map((sop) => sop.source_path)));
}

/** Document text per (tenant, path), for the leakage reference. */
const tenantText = new Map();
for (const tenant of ['T01-platform-operations-style', 'T04-customer-support-style', 'T05-policy-style']) {
  const corpus = read(`tenants/${tenant}.json`);
  const map = new Map();
  for (const sop of corpus.sops) {
    const existing = map.get(sop.source_path) ?? { title: sop.title, first: sop.summary.split('\n\n')[0] };
    map.set(sop.source_path, existing);
  }
  tenantText.set(tenant, map);
}

// ---------------------------------------------------------------------------

function trigrams(text) {
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w !== '');
  const out = new Set();
  for (let i = 0; i + 2 < words.length; i += 1) out.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return out;
}

function leakage(question, reference) {
  const q = trigrams(question);
  if (q.size === 0) return 1;
  const r = trigrams(reference);
  let shared = 0;
  for (const gram of q) if (r.has(gram)) shared += 1;
  return shared / q.size;
}

function unitHash(value) {
  return createHash('sha256').update(value, 'utf8').digest().readUInt32BE(0) / 0x100000000;
}

// The 7 out_of_scope rows that were already measured on the old held-out are pinned to
// the calibration split so they are never re-used as a measurement (g14: the already-seen
// held-out becomes calibration data). Implemented as an id pin; the seed/split logic is
// otherwise unchanged and reproducible.
const PINNED_CALIBRATION = new Set([
  'OD-01', 'OD-11', 'OD-13', // T04
  'SB-T01R-06', 'SB-T01R-07', // T01
  'SB-T05R-02', 'SB-T05R-03', // T05
]);

const splitFor = (id, forceCalibration = false) =>
  forceCalibration || unitHash(`${SEED}:${id}`) < CALIBRATION_FRACTION ? 'calibration' : 'held-out';

// ---------------------------------------------------------------------------
// Verify every path. Fail loudly on a miss.
// ---------------------------------------------------------------------------

const missing = [];
function verifyDocuments(tenant, documents) {
  const known = tenantDocuments.get(tenant);
  if (known === undefined) {
    missing.push(`unknown tenant ${tenant}`);
    return;
  }
  for (const document of documents) {
    if (!known.has(document)) missing.push(`${tenant}: ${document}`);
  }
}

const ownerLabelById = new Map(ownerLabels.rows.map((row) => [row.id, row]));
const questions = [];

for (const row of ownerRows.rows) {
  const label = ownerLabelById.get(row.id);
  verifyDocuments(ownerRows.tenant, label.documents);
  questions.push({
    id: row.id,
    text: row.text,
    tenant: ownerRows.tenant,
    slice: 'B',
    origin: 'owner-directed-draft',
    data_mode: 'simulated',
    label_source: label.label_source,
    label_basis: label.label_basis ?? ownerLabels.label_basis,
    ...(label.label_evidence !== undefined ? { label_evidence: label.label_evidence } : {}),
    ...(label.evidence_basis !== undefined ? { evidence_basis: label.evidence_basis } : {}),
    label: label.label,
    confidence: label.confidence,
    acceptable_documents: label.documents,
    reasoning: label.reasoning,
    split: splitFor(row.id, PINNED_CALIBRATION.has(row.id)),
  });
}

for (const row of expansion.rows) {
  verifyDocuments(row.tenant, row.documents);
  questions.push({
    id: row.id,
    text: row.text,
    tenant: row.tenant,
    slice: 'B',
    origin: expansion.origin,
    data_mode: expansion.data_mode,
    label_source: 'agent-agreed',
    label_basis: expansion.label_basis,
    label: row.label,
    confidence: row.confidence,
    acceptable_documents: row.documents,
    reasoning: 'Authored against the named document, which was verified to exist before the row was written.',
    split: splitFor(row.id, PINNED_CALIBRATION.has(row.id)),
  });
}

for (const row of refusalSurface.rows) {
  // No acceptable documents: the label is that the corpus cannot answer it.
  verifyDocuments(row.tenant, []);
  questions.push({
    id: row.id,
    text: row.text,
    tenant: row.tenant,
    slice: 'B',
    origin: refusalSurface.origin,
    data_mode: refusalSurface.data_mode,
    label_source: 'agent-agreed',
    label_basis: refusalSurface.label_basis,
    label: 'out_of_scope',
    confidence: 'high',
    acceptable_documents: [],
    reasoning: row.reason,
    split: splitFor(row.id, PINNED_CALIBRATION.has(row.id)),
  });
}

// g14 slice (i): cross-tenant OOS, constructed from other tenants' answerable rows.
// label_source = construction; easy_mode = true (answer document is absent from the target corpus).
for (const row of crossTenant.rows) {
  verifyDocuments(row.tenant, []); // out_of_scope: no documents
  questions.push({
    id: row.id,
    text: row.text,
    tenant: row.tenant,
    slice: 'B',
    origin: crossTenant.origin,
    data_mode: crossTenant.data_mode,
    label_source: 'construction',
    label_basis: crossTenant.label_basis,
    label: 'out_of_scope',
    confidence: 'high',
    acceptable_documents: [],
    reasoning: row.reason,
    easy_mode: row.easy_mode === true,
    split: splitFor(row.id, PINNED_CALIBRATION.has(row.id)),
  });
}

// g14 slice (ii): near-domain OOS, agent-authored, queued for owner spot-check.
for (const row of nearDomain.rows) {
  verifyDocuments(row.tenant, []); // out_of_scope: no documents
  questions.push({
    id: row.id,
    text: row.text,
    tenant: row.tenant,
    slice: 'B',
    origin: nearDomain.origin,
    data_mode: nearDomain.data_mode,
    label_source: 'agent',
    label_basis: nearDomain.label_basis,
    label: 'out_of_scope',
    confidence: 'high',
    acceptable_documents: [],
    reasoning: row.reason,
    queued_spot_check: row.queued_spot_check === true,
    split: splitFor(row.id, PINNED_CALIBRATION.has(row.id)),
  });
}

// Gold-set extension (prereg docs/prereg/gold-multilingual-rows.md): T01 es/fr/pt-BR
// user-voiced rows, authored in-language from documents already in the frozen 500-rung.
// Two independent agent passes; disagreements excluded at authoring time (none occurred).
for (const row of multilingual.rows) {
  verifyDocuments(multilingual.tenant, row.documents);
  questions.push({
    id: row.id,
    text: row.text,
    tenant: multilingual.tenant,
    slice: 'B',
    origin: multilingual.origin,
    data_mode: multilingual.data_mode,
    language: row.language,
    label_source: row.label_source ?? 'agent-agreed',
    label_basis: row.label_basis ?? multilingual.label_basis,
    label: row.label,
    confidence: row.confidence,
    acceptable_documents: row.documents,
    reasoning: row.reasoning,
    split: splitFor(row.id, PINNED_CALIBRATION.has(row.id)),
  });
}

for (const row of [...sliceA.rows, ...sliceAT05.rows]) {
  verifyDocuments(row.tenant, row.documents);
  const reference = tenantText.get(row.tenant).get(row.documents[0]);
  const score = leakage(row.text, `${reference.title} ${reference.first}`);
  questions.push({
    id: row.id,
    text: row.text,
    tenant: row.tenant,
    slice: 'A',
    origin: sliceA.origin,
    data_mode: sliceA.data_mode,
    label_source: 'agent-single',
    label_basis: sliceA.label_basis,
    label: 'answerable',
    confidence: 'high',
    acceptable_documents: row.documents,
    reasoning: 'Written against this document; the document is the answer by construction.',
    leakage_3gram: Number(score.toFixed(4)),
    title_echo: score > LEAKAGE_LIMIT,
    split: splitFor(row.id),
  });
}

if (missing.length > 0) {
  console.error('');
  console.error(`REFUSING TO WRITE: ${missing.length} document path(s) do not exist in the corpus.`);
  for (const entry of missing.slice(0, 12)) console.error(`  ${entry}`);
  console.error('');
  process.exit(4);
}

// ---------------------------------------------------------------------------

const counts = {
  total: questions.length,
  slice_a: questions.filter((q) => q.slice === 'A').length,
  slice_b: questions.filter((q) => q.slice === 'B').length,
  answerable: questions.filter((q) => q.label === 'answerable').length,
  out_of_scope: questions.filter((q) => q.label === 'out_of_scope').length,
  calibration: questions.filter((q) => q.split === 'calibration').length,
  held_out: questions.filter((q) => q.split === 'held-out').length,
  title_echo: questions.filter((q) => q.title_echo === true).length,
};

const byTenant = {};
for (const q of questions) byTenant[q.tenant] = (byTenant[q.tenant] ?? 0) + 1;

const byLanguageSplit = {};
for (const q of questions) {
  if (q.language === undefined) continue;
  const key = `${q.language} ${q.split}`;
  byLanguageSplit[key] = (byLanguageSplit[key] ?? 0) + 1;
}

const output = {
  note:
    'Gold set. Every row carries origin, label_source, data_mode and slice. Labels are at DOCUMENT ' +
    'level. Slice A rows are corpus-voiced and carry a computed 3-gram leakage figure that is REPORTED, ' +
    'not applied — a question in the document\'s register is the one that echoes the title. Slice A ' +
    'rows are never used in a headline.',
  seed: SEED,
  calibration_fraction: CALIBRATION_FRACTION,
  leakage_limit: LEAKAGE_LIMIT,
  owner_wording_note:
    'The OD- rows are owner-directed drafts: topics chosen by the owner, wording drafted by Claude. ' +
    'They are NOT real customer questions and must never be described as such.',
  counts,
  by_tenant: byTenant,
  questions,
};

writeFileSync(resolve(here, 'questions.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');

const echoScores = questions.filter((q) => q.slice === 'A').map((q) => q.leakage_3gram);

console.log('');
console.log('questions.json assembled');
console.log('');
console.log(`  total          ${counts.total}   (slice A ${counts.slice_a}, slice B ${counts.slice_b})`);
console.log(`  answerable     ${counts.answerable}`);
console.log(`  out_of_scope   ${counts.out_of_scope}`);
console.log(`  calibration    ${counts.calibration}`);
console.log(`  held-out       ${counts.held_out}`);
console.log('');
console.log(`  slice A title-echo above ${LEAKAGE_LIMIT}: ${counts.title_echo} of ${counts.slice_a}`);
console.log(`  slice A leakage mean ${(echoScores.reduce((s, v) => s + v, 0) / (echoScores.length || 1)).toFixed(4)}, max ${Math.max(...echoScores).toFixed(4)}`);
console.log('');
for (const [tenant, n] of Object.entries(byTenant)) console.log(`  ${tenant.padEnd(32)} ${n}`);
console.log('');
console.log('  multilingual rows by language and split:');
for (const [key, n] of Object.entries(byLanguageSplit)) console.log(`    ${key.padEnd(16)} ${n}`);
console.log('');
console.log(`  all ${counts.total} document paths verified against the corpus`);
console.log('');
