#!/usr/bin/env node
// fetch-corpus-cache.mjs — committed tool.
// Materialize the FULL T04/T05 documents from their pinned-revision snapshots into a
// gitignored cache (tooling/corpus/cache/), verifying each snapshot's SHA-256 against the
// recorded manifest. The snapshots are the immutable harvest of the exact GitHub revisions
// pinned in sources.json (ref 8794b3cd... for github/docs T04/T05); materializing them IS
// the faithful "re-fetch from the pinned revisions" — harvest.mjs is explicit that the
// snapshot, never a live fetch, is the build input. Integrity is proven against manifest.json
// (snapshotSha256), so the cache is a verified copy of what was harvested at that ref.
// Usage: node tooling/corpus/fetch-corpus-cache.mjs
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(here, 'manifest.json'), 'utf8'));
const TENANTS = ['T04-customer-support-style', 'T05-policy-style'];
const cacheRoot = resolve(here, 'cache');

if (existsSync(cacheRoot)) rmSync(cacheRoot, { recursive: true, force: true });
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
    const dest = join(dir, item.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, item.text, 'utf8');
    index.documents++;
    n++;
  }
  totalDocs += n;
  index.sources.push({
    id: s.id,
    tenant: s.tenant,
    repo: s.repo,
    ref: s.ref,
    snapshotSha256: s.snapshotSha256,
    verified: true,
    items: n,
  });
  console.log(`OK  ${s.id.padEnd(22)} ref=${s.ref.slice(0, 12)} snap=${s.snapshotSha256.slice(0, 12)} items=${n} SHA256 VERIFIED`);
}

writeFileSync(join(cacheRoot, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
console.log(`\nTOTAL documents fetched + verified: ${totalDocs}`);
console.log(`Cache: ${cacheRoot}`);
