#!/usr/bin/env node
/**
 * Planted-PII recall.
 *
 * The privacy gate is the only thing standing between a public document and a
 * customer-facing corpus, and the change it is being measured against relaxes a
 * rate. So detection is measured directly, on known input, separately from the
 * rate.
 *
 * A string is **caught** only if the category the gate claims to detect is the
 * one that fires. "Some finding appeared" is not enough: a postal address
 * reported as an account identifier is a miss for the address rule, and counting
 * it as a catch would hide a broken rule behind a working one.
 *
 * Recall is reported overall, by category and by language, and every miss is
 * named with its value so it can be diagnosed rather than merely counted. The
 * per-language split matters here: the corpus is 147 of 345 documents in
 * languages other than English, and a gate that only works in English would
 * quarantine almost nothing in `k8s-tasks-es`, `-pt-br` and `-fr` while passing
 * an English-only test.
 *
 * Run after `pnpm build` (it needs nothing else):
 *     node tooling/verify-pii-recall.mjs
 */

import { PLANTED, REQUIRED_CATEGORIES, REQUIRED_LANGUAGES } from './corpus/planted-pii.mjs';
import { scanForPii } from './corpus/pii-gate.mjs';

/** The bar the owner set. Below this, the gate is fixed before anything moves on. */
const RECALL_FLOOR = 0.95;

// ---------------------------------------------------------------------------
// Fixture sanity: a recall test that covers seven of eight categories and one
// language would report a healthy number and mean very little.
// ---------------------------------------------------------------------------

const problems = [];

if (PLANTED.length < 30) {
  problems.push(`only ${PLANTED.length} planted strings; the floor is 30`);
}

const coveredCategories = new Set(PLANTED.map((entry) => entry.category));
for (const category of REQUIRED_CATEGORIES) {
  if (!coveredCategories.has(category)) problems.push(`no planted string for category ${category}`);
}

const coveredLanguages = new Set(PLANTED.map((entry) => entry.language));
for (const language of REQUIRED_LANGUAGES) {
  if (!coveredLanguages.has(language)) problems.push(`no planted string for language ${language}`);
}

const duplicateIds = PLANTED.map((entry) => entry.id);
if (new Set(duplicateIds).size !== duplicateIds.length) problems.push('planted ids are not unique');

// ---------------------------------------------------------------------------
// The measurement.
// ---------------------------------------------------------------------------

const results = [];

for (const planted of PLANTED) {
  // The carrier is the document. A bare string is a pattern-matching exercise;
  // the gate has to work on prose.
  const document = planted.carrier;
  const scan = scanForPii(document);
  const fired = scan.findings.map((finding) => finding.pattern);

  results.push({
    ...planted,
    caught: fired.includes(planted.category),
    fired,
  });
}

const caught = results.filter((entry) => entry.caught);
const missed = results.filter((entry) => !entry.caught);
const recall = results.length === 0 ? 0 : caught.length / results.length;

function groupBy(key) {
  const groups = new Map();
  for (const entry of results) {
    const bucket = groups.get(entry[key]) ?? { caught: 0, total: 0 };
    bucket.total += 1;
    if (entry.caught) bucket.caught += 1;
    groups.set(entry[key], bucket);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const width = Math.max(...results.map((entry) => entry.id.length), 10);

console.log('');
console.log(`planted strings: ${results.length}  categories: ${coveredCategories.size}  languages: ${coveredLanguages.size}`);
console.log('');

console.log(`${'ID'.padEnd(width)}  ${'LANG'.padEnd(5)}  ${'CATEGORY'.padEnd(34)}  RESULT`);
console.log('-'.repeat(width + 5 + 36 + 10));

for (const entry of results) {
  const detail = entry.caught ? '' : `  (fired: ${entry.fired.join(', ') || 'nothing'})`;
  console.log(
    `${entry.id.padEnd(width)}  ${entry.language.padEnd(5)}  ${entry.category.padEnd(34)}  ${entry.caught ? 'caught' : 'MISS'}${detail}`,
  );
}

console.log('');
console.log('by category');
for (const [category, bucket] of groupBy('category')) {
  const rate = ((bucket.caught / bucket.total) * 100).toFixed(0);
  console.log(`  ${category.padEnd(34)} ${bucket.caught}/${bucket.total}  ${rate.padStart(3)}%`);
}

console.log('');
console.log('by language');
for (const [language, bucket] of groupBy('language')) {
  const rate = ((bucket.caught / bucket.total) * 100).toFixed(0);
  console.log(`  ${language.padEnd(34)} ${bucket.caught}/${bucket.total}  ${rate.padStart(3)}%`);
}

console.log('');
console.log(`RECALL  ${caught.length}/${results.length}  ${(recall * 100).toFixed(1)}%   floor ${(RECALL_FLOOR * 100).toFixed(0)}%`);

if (missed.length > 0) {
  console.log('');
  console.log('misses');
  for (const entry of missed) {
    console.log(`  ${entry.id}  [${entry.language}]  ${entry.category}`);
    console.log(`      value   : ${entry.value}`);
    console.log(`      carrier : ${entry.carrier}`);
    console.log(`      fired   : ${entry.fired.join(', ') || '(nothing)'}`);
  }
}

for (const problem of problems) {
  console.log('');
  console.log(`  FIXTURE PROBLEM  ${problem}`);
}

console.log('');

const ok = recall >= RECALL_FLOOR && problems.length === 0;
console.log(ok ? 'PII RECALL OK' : 'PII RECALL FAILED');

process.exit(ok ? 0 : 1);
