#!/usr/bin/env node
/**
 * Build tenant corpora from the harvested snapshots.
 *
 * Harvesting produces documents; the retrieval path consumes **procedures**. This
 * is the step between them, and it is the one place where a judgement call
 * changes every downstream number.
 *
 * ## The granularity decision
 *
 * The simulated tenant's procedures were short — a paragraph or two, the size of
 * a real support article. A harvested Kubernetes document is 2,000–20,000
 * characters: a whole task page, with prerequisites, steps, verification and
 * cleanup. Emitting one procedure per document would make retrieval trivially
 * easy and useless — every query about pods would match the same enormous
 * passage, and the Confidence Gate would be measuring passage length rather than
 * topical fit.
 *
 * So a procedure is a **passage group**: consecutive paragraphs up to a target
 * size. The targets are:
 *
 *   - `TARGET_CHARS` ≈ the simulated tenant's procedure length, so the retrieval
 *     geometry the thresholds were tuned against stays comparable;
 *   - never split mid-paragraph, so a procedure is readable prose;
 *   - carry the source document's path, so a result can be traced to its origin.
 *
 * **This is a design decision and it is provisional.** Procedure granularity
 * determines what counts as a correct answer, so it is coupled to the gold set's
 * register (see `p1-gold-set-plan.md`). The default below is defensible and
 * reproducible; it is not yet ratified.
 *
 * ## What is derived rather than extracted
 *
 * `title` and `suggestedReply` are **generated from the passage**, not authored.
 * They are marked `derived: true` in the output so nothing downstream mistakes
 * them for source text. The `summary` is the passage itself and is verbatim.
 *
 * Usage:
 *     node tooling/corpus/build-tenant.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Target procedure size. Matches the simulated tenant's short-article shape. */
const TARGET_CHARS = 900;

/** Hard ceiling. A single paragraph longer than this is split on sentence ends. */
const MAX_CHARS = 1600;

/** Below this a passage is a fragment, not a procedure. */
const MIN_CHARS = 180;

/**
 * Phrases that mean "a human must handle this", not "here is the answer".
 * Deliberately narrow: a technical document that merely *mentions* support is
 * not an escalation, it is a document that mentions support.
 */
const ESCALATION_PHRASES = [
  'contact support',
  'contact github support',
  'open a support ticket',
  'raise a support request',
  'file a bug',
  'report a vulnerability',
  'security@',
  'legal@',
  'cannot be recovered',
  'irreversible',
  'data loss',
];

const manifest = JSON.parse(readFileSync(resolve(here, 'manifest.json'), 'utf8'));

/** Split prose into paragraphs, dropping empties. */
function paragraphs(text) {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/** Split an over-long paragraph on sentence ends. */
function splitLong(paragraph) {
  if (paragraph.length <= MAX_CHARS) return [paragraph];

  const sentences = paragraph.match(/[^.!?]+[.!?]+[\s]*/g) ?? [paragraph];
  const out = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).length > TARGET_CHARS && current !== '') {
      out.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim() !== '') out.push(current.trim());
  return out;
}

/** Group paragraphs into passages of roughly TARGET_CHARS. */
function toPassages(text) {
  const passages = [];
  let current = '';

  for (const paragraph of paragraphs(text).flatMap(splitLong)) {
    if (current === '') {
      current = paragraph;
      continue;
    }
    if ((current + '\n\n' + paragraph).length > TARGET_CHARS) {
      passages.push(current);
      current = paragraph;
    } else {
      current += '\n\n' + paragraph;
    }
  }
  if (current !== '') passages.push(current);

  return passages.filter((passage) => passage.length >= MIN_CHARS);
}

/** A readable title from the passage's opening sentence. */
function deriveTitle(passage, documentName, index) {
  const firstSentence = /^[^.!?]{10,110}[.!?]/.exec(passage);
  if (firstSentence !== null) return firstSentence[0].replace(/[.!?]$/, '').trim();
  const stem = documentName.replace(/\.[a-z]+$/, '').replace(/[-_]/g, ' ');
  return `${stem} (part ${index + 1})`;
}

/** A reply that restates the passage rather than inventing an answer. */
function deriveReply(passage) {
  const lead = passage.split('\n\n')[0];
  const trimmed = lead.length > 320 ? `${lead.slice(0, 317)}...` : lead;
  return `${trimmed}\n\nThis is taken from the procedure above; if it does not resolve the issue, a human should review it.`;
}

function escalationFor(passage) {
  const lower = passage.toLowerCase();
  const hit = ESCALATION_PHRASES.find((phrase) => lower.includes(phrase));
  if (hit === undefined) return { escalationRequired: false, escalationReason: '' };
  return {
    escalationRequired: true,
    escalationReason: `the source document says "${hit}", which requires a human rather than a generated answer`,
  };
}

// ---------------------------------------------------------------------------

mkdirSync(resolve(here, 'tenants'), { recursive: true });

const byTenant = new Map();
let totalProcedures = 0;
let totalPassagesSkipped = 0;

for (const source of manifest.sources.filter((entry) => entry.status === 'harvested')) {
  const snapshot = JSON.parse(readFileSync(resolve(here, source.snapshot), 'utf8'));
  const bucket = byTenant.get(source.tenant) ?? {
    tenant: source.tenant,
    domain_analogue: source.domain_analogue,
    data_mode: 'web-sourced',
    languages: new Set(),
    sops: [],
  };

  for (const item of snapshot.items) {
    bucket.languages.add(item.language);

    const passages = toPassages(item.text);
    totalPassagesSkipped += passages.length === 0 ? 1 : 0;

    passages.forEach((passage, index) => {
      const escalation = escalationFor(passage);
      bucket.sops.push({
        id: `${source.id}-${String(bucket.sops.length + 1).padStart(4, '0')}`,
        title: deriveTitle(passage, item.name, index),
        category: source.domain_analogue,
        summary: passage,
        suggestedReply: deriveReply(passage),
        escalationRequired: escalation.escalationRequired,
        escalationReason: escalation.escalationReason,
        // Transitional, and empty on purpose: the embedding scorer replaces
        // keyword matching, so inventing keywords here would create a second,
        // worse retrieval path.
        triggerKeywords: [],
        language: item.language,
        source_id: source.id,
        source_path: item.path,
        licence: source.licence,
        derived: { title: true, suggestedReply: true, summary: false },
      });
    });

    byTenant.set(source.tenant, bucket);
  }
}

console.log('');
console.log('tenant build');
console.log('');

for (const [tenant, bucket] of byTenant) {
  const languages = [...bucket.languages].sort();
  const escalations = bucket.sops.filter((sop) => sop.escalationRequired).length;
  const lengths = bucket.sops.map((sop) => sop.summary.length);
  const mean = lengths.reduce((sum, value) => sum + value, 0) / (lengths.length || 1);

  const out = {
    data_mode: 'web-sourced',
    tenant,
    domain_analogue: bucket.domain_analogue,
    languages,
    note:
      'Procedures derived from harvested documents by passage grouping. `title` and `suggestedReply` ' +
      'are generated and marked derived; `summary` is verbatim source text. See build-tenant.mjs for ' +
      'the granularity decision, which is provisional.',
    sops: bucket.sops,
  };

  const file = `tenants/${tenant}.json`;
  writeFileSync(resolve(here, file), `${JSON.stringify(out, null, 2)}\n`, 'utf8');

  totalProcedures += bucket.sops.length;

  console.log(`  ${tenant}`);
  console.log(`    procedures   ${bucket.sops.length}`);
  console.log(`    languages    ${languages.join(', ')}`);
  console.log(`    escalations  ${escalations}`);
  console.log(`    mean length  ${Math.round(mean)} chars (min ${Math.min(...lengths)}, max ${Math.max(...lengths)})`);
  console.log(`    written to   tooling/corpus/${file}`);
  console.log('');
}

console.log(`  total procedures ${totalProcedures}`);
console.log(`  documents that produced no passage ${totalPassagesSkipped}`);
console.log('');
