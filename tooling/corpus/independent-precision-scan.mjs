#!/usr/bin/env node
/**
 * Independent precision check.
 *
 * Deliberately **not** the gate. Three plain patterns — an email shape, a
 * phone-ish shape, a long digit run — written from scratch and run over every
 * document in the corpus. The point is to find what a simple reader would find
 * and compare it with what the gate reports.
 *
 * Why this is worth doing separately: recall harnesses only measure the strings
 * somebody thought to plant. They say nothing about what the gate *fails to
 * quarantine* in real text, which is the number a reviewer actually cares about.
 * A gate with perfect recall on planted strings and a blind spot on a real
 * document shape is a gate with a blind spot.
 *
 * Every hit is printed with enough context to classify by hand. The
 * classification is a judgement, not a regex, and the script does not pretend
 * otherwise.
 *
 * Usage:
 *     node tooling/corpus/independent-precision-scan.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// The independent patterns. Simple on purpose — no validators, no vocabulary.
// ---------------------------------------------------------------------------

const PATTERNS = [
  { name: 'email-shape', pattern: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu },
  { name: 'phone-shape', pattern: /\b\d[\d\s().-]{6,}\d\b/gu },
  { name: 'long-digit-run', pattern: /\b\d{6,}\b/g },
];

const manifest = JSON.parse(readFileSync(resolve(here, 'manifest.json'), 'utf8'));

const hits = [];
let documents = 0;

for (const source of manifest.sources.filter((entry) => entry.status === 'harvested')) {
  const snapshot = JSON.parse(readFileSync(resolve(here, source.snapshot), 'utf8'));

  for (const item of snapshot.items) {
    documents += 1;
    for (const { name, pattern } of PATTERNS) {
      const scanner = new RegExp(pattern.source, pattern.flags);
      for (const match of item.text.matchAll(scanner)) {
        const value = match[0];
        // One line of context either side, so a classification is possible
        // without opening the file.
        const from = Math.max(0, match.index - 45);
        const context = item.text.slice(from, match.index + value.length + 45).replace(/\s+/g, ' ');
        hits.push({ pattern: name, value, sourceId: source.id, path: item.path, context });
      }
    }
  }
}

// De-duplicate by pattern+value: the same address in fifty documents is one
// finding to classify, not fifty.
const byValue = new Map();
for (const hit of hits) {
  const key = `${hit.pattern}\u0000${hit.value}`;
  const existing = byValue.get(key);
  if (existing === undefined) {
    byValue.set(key, { ...hit, count: 1 });
  } else {
    existing.count += 1;
  }
}

const distinct = [...byValue.values()].sort((left, right) => right.count - left.count);

console.log('');
console.log(`independent scan — ${documents} documents, ${hits.length} raw hits, ${distinct.length} distinct values`);
console.log('');

console.log(`${'PATTERN'.padEnd(17)} ${'N'.padStart(4)}  VALUE`);
console.log('-'.repeat(17 + 6 + 60));
for (const hit of distinct) {
  console.log(`${hit.pattern.padEnd(17)} ${String(hit.count).padStart(4)}  ${hit.value.slice(0, 58)}`);
}

console.log('');
console.log('context for each distinct value (for hand classification)');
console.log('');
for (const hit of distinct) {
  console.log(`  [${hit.pattern}] ${hit.value}`);
  console.log(`      ${hit.context.slice(0, 150)}`);
  console.log(`      first seen: ${hit.sourceId} :: ${hit.path}`);
}

// ---------------------------------------------------------------------------

const byPattern = {};
for (const hit of distinct) byPattern[hit.pattern] = (byPattern[hit.pattern] ?? 0) + 1;

console.log('');
console.log('summary');
for (const [name, count] of Object.entries(byPattern)) console.log(`  ${name.padEnd(17)} ${count} distinct`);

const json = {
  note:
    'Independent precision scan: three plain patterns written separately from the privacy gate, run over every ' +
    'document in the corpus. Every distinct hit is listed for hand classification.',
  generated_at: new Date().toISOString(),
  documents,
  raw_hits: hits.length,
  distinct_values: distinct.length,
  by_pattern: byPattern,
  hits: distinct.map((hit) => ({
    pattern: hit.pattern,
    value: hit.value,
    count: hit.count,
    source_id: hit.sourceId,
    path: hit.path,
    context: hit.context.slice(0, 200),
  })),
};

const out = resolve(here, 'independent-precision-scan.json');
import('node:fs').then(({ writeFileSync }) => {
  writeFileSync(out, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
  console.log('');
  console.log(`wrote ${out}`);
});
