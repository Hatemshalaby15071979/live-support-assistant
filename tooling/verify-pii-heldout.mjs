#!/usr/bin/env node
/**
 * Held-out planted-PII recall.
 *
 * The 44-string set in `planted-pii.mjs` is a regression set. This one is the
 * measurement, and the difference is only the commit order: the fixture landed
 * before the gate was ever run against it (`e337174`).
 *
 * **A string counts as caught only if the pattern the gate claims for that
 * category is the one that fires.** "Some finding appeared" is not enough — an
 * address reported as an account identifier is a miss for the address rule, and
 * counting it would hide a broken rule behind a working one.
 *
 * Two categories here have **no rule at all** (`national-id`, `bank-identifier`).
 * They are expected to miss, and they are in the set precisely so the gap is a
 * number rather than an assumption. A category with no rule is still accepted if
 * a related rule catches it by accident, because that is what a reader would
 * count as found.
 *
 * Usage:
 *     node tooling/verify-pii-heldout.mjs
 */

import { HELDOUT_FINAL, HELDOUT_CATEGORIES, HELDOUT_LANGUAGES } from './corpus/planted-pii-heldout-final.mjs';
import { acceptedPatternsFor } from './corpus/pii-categories.mjs';
import { scanForPii } from './corpus/pii-gate.mjs';

const RECALL_FLOOR = 0.95;

/**
 * Which gate patterns count as a catch for each planted category.
 *
 * The first eight map one-to-one onto the gate's own claimed categories. The
 * last two now have dedicated rules as well, so they map to those — with the
 * older SSN-shaped rule still accepted for `national-id`, because an SSN is a
 * national id and either rule finding it is a catch.
 */
const ACCEPTED_PATTERNS = {
  email: ['email', 'email-obfuscated'],
  'phone-international': ['phone-international'],
  'phone-national': ['phone-national'],
  'postal-address': ['postal-address'],
  'account-identifier': ['account-identifier'],
  'honorific-name': ['honorific-name'],
  'labelled-contact-name': ['labelled-contact-name'],
  'national-id': ['national-id', 'national-insurance-or-ssn-shaped'],
  'bank-identifier': ['bank-identifier'],
};

const problems = [];

if (HELDOUT_FINAL.length < 30) problems.push(`only ${HELDOUT_FINAL.length} held-out strings; 30 were required`);
for (const category of HELDOUT_CATEGORIES) {
  if (!HELDOUT_FINAL.some((entry) => entry.category === category)) problems.push(`no held-out string for ${category}`);
}
for (const language of HELDOUT_LANGUAGES) {
  if (!HELDOUT_FINAL.some((entry) => entry.language === language)) problems.push(`no held-out string for ${language}`);
}

// ---------------------------------------------------------------------------

const results = HELDOUT_FINAL.map((planted) => {
  const scan = scanForPii(planted.carrier);
  const fired = scan.findings.map((finding) => finding.pattern);
  const accepted = acceptedPatternsFor(planted.category);
  return { ...planted, fired, caught: fired.some((pattern) => accepted.includes(pattern)) };
});

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

console.log('');
console.log(`HELD-OUT SET — fixture committed before this run`);
console.log(`strings: ${results.length}   categories: ${HELDOUT_CATEGORIES.length}   languages: ${HELDOUT_LANGUAGES.length}`);
console.log('');

console.log(`${'ID'.padEnd(9)} ${'LANG'.padEnd(6)} ${'CATEGORY'.padEnd(22)} RESULT`);
console.log('-'.repeat(9 + 6 + 22 + 12));
for (const entry of results) {
  const detail = entry.caught ? '' : `  (fired: ${entry.fired.join(', ') || 'nothing'})`;
  console.log(`${entry.id.padEnd(9)} ${entry.language.padEnd(6)} ${entry.category.padEnd(22)} ${entry.caught ? 'caught' : 'MISS'}${detail}`);
}

console.log('');
console.log('by language');
for (const [language, bucket] of groupBy('language')) {
  console.log(`  ${language.padEnd(8)} ${String(bucket.caught).padStart(2)}/${String(bucket.total).padEnd(3)} ${((bucket.caught / bucket.total) * 100).toFixed(1).padStart(5)}%`);
}

console.log('');
console.log('by category');
for (const [category, bucket] of groupBy('category')) {
  const note = ACCEPTED_PATTERNS[category] === undefined ? '' : (['national-id', 'bank-identifier'].includes(category) ? '   <- no dedicated rule' : '');
  console.log(`  ${category.padEnd(24)} ${String(bucket.caught).padStart(2)}/${String(bucket.total).padEnd(3)} ${((bucket.caught / bucket.total) * 100).toFixed(1).padStart(5)}%${note}`);
}

console.log('');
console.log(`HELD-OUT RECALL  ${caught.length}/${results.length}  ${(recall * 100).toFixed(1)}%   floor ${(RECALL_FLOOR * 100).toFixed(0)}%`);

if (missed.length > 0) {
  console.log('');
  console.log('misses');
  for (const entry of missed) {
    console.log(`  ${entry.id}  [${entry.language}]  ${entry.category}  value: ${entry.value}`);
    console.log(`      fired: ${entry.fired.join(', ') || '(nothing)'}`);
  }
}

for (const problem of problems) {
  console.log('');
  console.log(`  FIXTURE PROBLEM  ${problem}`);
}

console.log('');
const ok = recall >= RECALL_FLOOR && problems.length === 0;
console.log(ok ? 'HELD-OUT RECALL OK' : 'HELD-OUT RECALL FAILED');

process.exit(ok ? 0 : 1);
