#!/usr/bin/env node
/**
 * Which localised pages have an English counterpart **in the corpus**.
 *
 * This exists because of a specific claim that would otherwise be easy to make
 * and wrong: that the four Kubernetes language trees give "the same content in
 * four languages". They do not necessarily. A localised tree is a partial
 * translation of the English one, updated on its own schedule, and the corpus
 * holds only the documents that survived the gates.
 *
 * A language comparison across pages that are not the same page measures the
 * *corpus*, not the language. So the match rate is measured, published, and any
 * comparison that depends on parity is labelled accordingly.
 *
 * The match key is the path with the language segment removed:
 *
 *     content/es/docs/tasks/foo/bar.md  ->  docs/tasks/foo/bar.md
 *     content/en/docs/tasks/foo/bar.md  ->  docs/tasks/foo/bar.md
 *
 * A pair is a genuine translation pair only if both sides are in the corpus. A
 * page whose English original was excluded by a gate is not a pair for this
 * purpose, because there is nothing to compare it against.
 *
 * Usage:
 *   node tooling/corpus/translation-pairs.mjs
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(here, 'manifest.json'), 'utf8'));

/** `content/<lang>/rest` -> `rest`, so the language stops being part of the key. */
function languageIndependentPath(path) {
  return path.replace(/^content\/[a-z]{2}(?:-[a-z]{2})?\//, '');
}

function languageOf(path) {
  const match = /^content\/([a-z]{2}(?:-[a-z]{2})?)\//.exec(path);
  return match === null ? null : match[1];
}

// ---------------------------------------------------------------------------
// Load every harvested item, grouped by language.
// ---------------------------------------------------------------------------

/** @type {Map<string, {path: string, sourceId: string}[]>} */
const byLanguage = new Map();
let itemsRead = 0;

for (const source of manifest.sources.filter((entry) => entry.status === 'harvested')) {
  const snapshot = JSON.parse(readFileSync(resolve(here, source.snapshot), 'utf8'));

  for (const item of snapshot.items) {
    const language = languageOf(item.path);
    if (language === null) continue;

    const bucket = byLanguage.get(language) ?? [];
    bucket.push({ path: item.path, key: languageIndependentPath(item.path), sourceId: source.id });
    byLanguage.set(language, bucket);
    itemsRead += 1;
  }
}

const english = byLanguage.get('en') ?? [];
const englishKeys = new Set(english.map((entry) => entry.key));

// ---------------------------------------------------------------------------
// Compare.
// ---------------------------------------------------------------------------

const report = {
  note:
    'Which localised pages have an English counterpart in the corpus, by path with the language ' +
    'segment removed. A language comparison across pages that are not the same page measures the ' +
    'corpus, not the language.',
  generated_at: new Date().toISOString(),
  items_read: itemsRead,
  english_items: english.length,
  languages: {},
};

process.stdout.write('\ntranslation pairs\n');
process.stdout.write(`  english items in corpus : ${english.length}\n\n`);
process.stdout.write(`  ${'LANG'.padEnd(7)} ${'ITEMS'.padStart(6)} ${'MATCHED'.padStart(8)} ${'RATE'.padStart(7)}   VERDICT\n`);
process.stdout.write(`  ${'-'.repeat(7)} ${'-'.repeat(6)} ${'-'.repeat(8)} ${'-'.repeat(7)}   ${'-'.repeat(30)}\n`);

for (const [language, entries] of [...byLanguage.entries()].sort()) {
  if (language === 'en') continue;

  const matched = entries.filter((entry) => englishKeys.has(entry.key));
  const rate = entries.length === 0 ? 0 : matched.length / entries.length;

  // The threshold is a reporting decision, not a pass/fail: below it, any
  // cross-language comparison has to say what it is comparing.
  const verdict = rate >= 0.9
    ? 'parity — safe to compare'
    : rate >= 0.5
      ? 'PARTIAL — label comparisons'
      : 'different content, not parity';

  report.languages[language] = {
    items: entries.length,
    matched: matched.length,
    rate: Number(rate.toFixed(4)),
    verdict,
    unmatched_examples: entries.filter((entry) => !englishKeys.has(entry.key)).slice(0, 5).map((entry) => entry.path),
  };

  process.stdout.write(
    `  ${language.padEnd(7)} ${String(entries.length).padStart(6)} ${String(matched.length).padStart(8)} ` +
      `${(rate * 100).toFixed(1).padStart(6)}%   ${verdict}\n`,
  );
}

process.stdout.write('\n');

for (const [language, entry] of Object.entries(report.languages)) {
  if (entry.unmatched_examples.length === 0) continue;
  process.stdout.write(`  ${language}: no English counterpart in the corpus, e.g.\n`);
  for (const path of entry.unmatched_examples) process.stdout.write(`      ${path}\n`);
}

writeFileSync(resolve(here, 'translation-pairs.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`\nwrote translation-pairs.json\n`);

if (!existsSync(resolve(here, 'translation-pairs.json'))) process.exit(1);
