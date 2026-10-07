#!/usr/bin/env node
/**
 * Re-apply the privacy gate to the stored snapshots.
 *
 * The gate changed after the corpus was harvested — three preregs and three
 * repair cycles — so the stored items no longer match the rules that govern
 * them. `verify-corpus.mjs` reports this correctly as "item carries personal
 * data", and it is right: the corpus was built under older rules.
 *
 * **This does not harvest.** It fetches nothing, adds no source, and reads only
 * the text already committed. It re-runs the gate over that text, drops what the
 * current rules quarantine, and rewrites the manifest counts. The owner closed
 * harvesting to new sources; re-filtering the existing text is a different
 * operation and the distinction is worth stating rather than assuming.
 *
 * A snapshot whose bytes change is renamed, because snapshots are named by the
 * SHA-256 of their own contents. That is the point of the scheme: the new file
 * says the contents changed, and the old one stays reachable in history.
 *
 * Usage:
 *     node tooling/corpus/refilter.mjs
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SOURCE_QUARANTINE_LIMIT, scanForPii } from './pii-gate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(here, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

console.log('');
console.log('re-filter — re-applying the current gate to stored text, no fetching');
console.log('');

let totalBefore = 0;
let totalAfter = 0;
let totalDropped = 0;

for (const source of manifest.sources) {
  if (source.status !== 'harvested') continue;

  const snapshotPath = resolve(here, source.snapshot);
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const before = snapshot.items.length;
  totalBefore += before;

  const kept = [];
  const newlyQuarantined = [];

  for (const item of snapshot.items) {
    const scan = scanForPii(item.text);
    if (scan.clean) {
      kept.push(item);
    } else {
      newlyQuarantined.push({
        path: item.path,
        patterns: scan.findings.map((finding) => finding.pattern),
      });
    }
  }

  const considered = kept.length + newlyQuarantined.length;
  const quarantinedHigh = newlyQuarantined.filter((entry) =>
    entry.patterns.some((pattern) => {
      const rule = pattern === 'account-identifier-shape' ? 'high' : 'high';
      return rule === 'high';
    }),
  ).length;
  const rateHigh = considered === 0 ? 0 : quarantinedHigh / considered;

  totalAfter += kept.length;
  totalDropped += newlyQuarantined.length;

  const status = rateHigh > SOURCE_QUARANTINE_LIMIT ? 'dropped' : 'harvested';

  console.log(`  ${source.id}`);
  console.log(`    items  ${before} -> ${kept.length}   (${newlyQuarantined.length} newly quarantined)`);
  if (newlyQuarantined.length > 0 && newlyQuarantined.length <= 6) {
    for (const entry of newlyQuarantined) {
      console.log(`      ${entry.path.split('/').slice(-1)[0]}  [${entry.patterns.join(', ')}]`);
    }
  }
  console.log(`    status ${source.status} -> ${status}`);
  console.log('');

  if (status !== 'harvested') {
    source.status = 'dropped';
    source.reason = `high-severity quarantine rate ${(rateHigh * 100).toFixed(1)}% exceeds the ${(SOURCE_QUARANTINE_LIMIT * 100).toFixed(0)}% limit, measured on re-filter`;
    continue;
  }

  if (kept.length === before) continue;

  // Rewrite the snapshot under its new content hash.
  const body = `${JSON.stringify({ ...snapshot, items: kept }, null, 2)}\n`;
  const sha = createHash('sha256').update(body, 'utf8').digest('hex');
  const newFile = `snapshots/${sha}.json`;
  const newPath = resolve(here, newFile);

  if (!existsSync(newPath)) writeFileSync(newPath, body, 'utf8');
  if (newPath !== snapshotPath && existsSync(snapshotPath)) unlinkSync(snapshotPath);

  source.snapshot = newFile;
  source.snapshotSha256 = sha;
  source.items = kept.length;
  source.quarantine_detail = newlyQuarantined.map((entry) => ({ path: entry.path, patterns: entry.patterns }));
  source.refiltered_at = new Date().toISOString();
}

manifest.refilter_note =
  'Items were re-gated after the privacy rules changed. This is not a harvest: no source was added and ' +
  'nothing was fetched. Snapshots whose contents changed were renamed to their new content hash.';

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`  items ${totalBefore} -> ${totalAfter}   (${totalDropped} quarantined by the current gate)`);
console.log('');
