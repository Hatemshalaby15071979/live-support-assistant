#!/usr/bin/env node
// fetch-corpus-cache.mjs — committed tool.
// Re-fetch full T04/T05 source documents from raw.githubusercontent.com at the pinned refs
// declared in sources.json, run the same extraction as harvest.mjs, and materialize the
// processed full documents in gitignored tooling/corpus/cache/. Before fetching, verify each
// source snapshot hash against manifest.json; after extraction, verify every document SHA-256
// against its snapshot item hash. The latter is the manifest's per-document evidence ledger.
// Usage: node tooling/corpus/fetch-corpus-cache.mjs
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(here, 'manifest.json'), 'utf8'));
const TENANTS = ['T04-customer-support-style', 'T05-policy-style'];
const cacheRoot = resolve(here, 'cache');
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function extractProse(document) {
  let text = document;
  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3);
    if (end !== -1) text = text.slice(end + 4);
  }
  return text
    .replace(/\{\{[%<][\s\S]*?[%>]\}\}/g, ' ')
    .replace(/^\s*\.\.\s+\w+::.*(?:\n(?:\s{3,}.*|\s*))*/gm, ' ')
    .replace(/:\w+:`([^`]*)`/g, '$1')
    .replace(/^\s*[=\-~^"']{3,}\s*$/gm, ' ')
    .replace(/^\s*\.\.\s+_?[^\n]*$/gm, ' ')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\|/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchPinned(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'live-support-assistant-corpus-relabel/1.0' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(800 * attempt);
    }
  }
  throw lastError;
}

// Reuse and overwrite existing cached paths; this avoids bulk deletion and keeps
// previously fetched verified files intact if a network retry is needed.
mkdirSync(cacheRoot, { recursive: true });

const index = { generated_at: new Date().toISOString(), tenants: TENANTS, sources: [], documents: 0 };
let totalDocs = 0;

for (const s of manifest.sources) {
  if (!TENANTS.includes(s.tenant)) continue;
  if (s.status !== 'harvested') {
    console.error(`SKIP ${s.id}: status=${s.status}`);
    continue;
  }
  const snapPath = resolve(here, s.snapshot);
  const raw = readFileSync(snapPath, 'utf8');
  const actual = createHash('sha256').update(raw, 'utf8').digest('hex');
  if (actual !== s.snapshotSha256) {
    throw new Error(`SHA-256 MISMATCH for ${s.id}: manifest ${s.snapshotSha256} != actual ${actual}`);
  }
  const snap = JSON.parse(raw);
  const dir = join(cacheRoot, s.tenant, s.id);
  mkdirSync(dir, { recursive: true });
  let n = 0;
  for (const item of snap.items) {
    const url = `https://raw.githubusercontent.com/${s.repo}/${s.ref}/${item.path}`;
    const sourceText = await fetchPinned(url);
    const text = extractProse(sourceText);
    const itemHash = createHash('sha256').update(text, 'utf8').digest('hex');
    if (itemHash !== item.textSha256) {
      throw new Error(`RE-FETCH SHA-256 MISMATCH for ${s.id}/${item.path}: snapshot manifest ${item.textSha256} != fetched ${itemHash}`);
    }
    const dest = join(dir, item.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, text, 'utf8');
    index.documents++;
    n++;
    if (n < snap.items.length) await sleep(250);
  }
  totalDocs += n;
  index.sources.push({
    id: s.id,
    tenant: s.tenant,
    repo: s.repo,
    ref: s.ref,
    snapshotSha256: s.snapshotSha256,
    snapshot_verified: true,
    document_hashes_verified: n,
    items: n,
  });
  console.log(`OK  ${s.id.padEnd(22)} ref=${s.ref.slice(0, 12)} snapshot SHA256 VERIFIED; document SHA256 ${n}/${n} verified`);
}

writeFileSync(join(cacheRoot, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
console.log(`\nTOTAL documents fetched + verified: ${totalDocs}`);
console.log(`Cache: ${cacheRoot}`);
