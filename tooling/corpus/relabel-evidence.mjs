#!/usr/bin/env node
// relabel-evidence.mjs — committed tool.
// Produce UPGRADED relabel evidence for T04 OD rows (the owner DISAGREE batch).
// For each question it prints:
//   (a) TOP-3 nearest documents by the live bi-encoder (Xenova/all-MiniLM-L6-v2) over
//       full-text documents from both cached T04 and T05 corpora.
//   (b) KEYWORD SEARCH across ALL cached T04+T05 full documents using terms from the
//       question, with document paths and exact source passages (up to ~1200 chars)
//       around hits. Embedding top-3 can miss the real answer; keyword search is the
//       independent cross-check. Excerpts preserve source whitespace and punctuation.
// Usage: node tooling/corpus/relabel-evidence.mjs "question 1" "question 2" ...
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cosineSimilarity } from '../../packages/vector-store/dist/cosine.js';
import { createEmbedder } from '../../packages/embedder/dist/embedder.js';

const here = dirname(fileURLToPath(import.meta.url));
const cacheRoot = resolve(here, 'cache');
const TENANTS = ['T04-customer-support-style', 'T05-policy-style'];

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.md$/.test(e)) out.push(p);
  }
  return out;
}
const files = TENANTS.flatMap((t) => walk(join(cacheRoot, t))).sort();
const docs = files.map((p) => ({ path: relative(cacheRoot, p), text: readFileSync(p, 'utf8') }));
console.error(`Loaded ${docs.length} full T04/T05 documents from cache.`);

const STOP = new Set([
  'why', 'what', 'when', 'where', 'how', 'who', 'the', 'and', 'you', 'your', 'my', 'me', 'do',
  'does', 'did', 'not', 'but', 'for', 'with', 'this', 'that', 'from', 'are', 'was', 'were',
  'have', 'been', 'can', 'will', 'would', 'should', 'about', 'into', 'they', 'them', 'then',
  'there', 'these', 'those', 'want', 'get', 'got', 'let', 'off', 'out', 'ask', 'tell', 'need',
  'know', 'says', 'said', 'told', 'still', 'never', 'only', 'just', 'like', 'able', 'cant',
  'dont', 'didnt', 'isnt', 'wont', 'im', 'ive', 'every', 'each', 'some', 'any', 'per', 'use',
  'using', 'used', 'much', 'many', 'more', 'than', 'please', 'help', 'make', 'made', 'keep',
  'sent', 'send', 'turn', 'stop', 'delete',
]);
function terms(q) {
  return [...new Set(
    q.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter((w) => w.length >= 4 && !STOP.has(w)),
  )];
}

const embedder = await createEmbedder();
const docVecs = await embedder.embedPassages(docs.map((d) => d.text));
console.error(`Embedded ${docVecs.length} documents.`);

const questions = process.argv.slice(2);
if (questions.length === 0) {
  console.error('usage: node relabel-evidence.mjs "q1" "q2" ...');
  process.exit(1);
}

for (const q of questions) {
  console.log('\n================ QUESTION ================');
  console.log(q);
  const qv = await embedder.embedQuery(q);
  const scored = docs
    .map((d, i) => ({ path: d.path, s: cosineSimilarity(qv, docVecs[i]) }))
    .sort((a, b) => b.s - a.s);
  console.log('\n(a) TOP-3 BY EMBEDDING:');
  for (const t of scored.slice(0, 3)) console.log(`   ${t.s.toFixed(4)}  ${t.path}`);

  const ks = terms(q);
  console.log(`\n(b) KEYWORD SEARCH (terms: ${ks.join(', ') || '(none >=4 chars)'})`);
  if (ks.length === 0) {
    console.log('   (no usable keyword terms)');
  } else {
    const ranked = [];
    for (const d of docs) {
      const low = d.text.toLowerCase();
      const matched = new Set();
      let firstHit = -1;
      for (const k of ks) {
        const idx = low.indexOf(k);
        if (idx >= 0) {
          matched.add(k);
          if (firstHit === -1 || idx < firstHit) firstHit = idx;
        }
      }
      if (matched.size > 0) ranked.push({ path: d.path, text: d.text, terms: matched, firstHit });
    }
    ranked.sort((a, b) => b.terms.size - a.terms.size || a.firstHit - b.firstHit);
    console.log(`   Scanned ${docs.length} documents; ${ranked.length} had at least one term hit.`);
    const top = ranked.slice(0, 6);
    if (top.length === 0) console.log('   (no keyword hits in T04/T05 corpus)');
    for (const r of top) {
      const start = Math.max(0, r.firstHit - 200);
      const end = Math.min(r.text.length, r.firstHit + 1000);
      const snippet = r.text.slice(start, end);
      console.log(`   HIT ${r.path}  (terms: ${[...r.terms].join(', ')})`);
      console.log(`        exact source excerpt begins at character ${start}:`);
      console.log(snippet);
      console.log('        [excerpt end]');
    }
  }
}
