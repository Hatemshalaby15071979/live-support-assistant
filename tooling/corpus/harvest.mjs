#!/usr/bin/env node
/**
 * Harvest licensed documents into pinned snapshots.
 *
 * The pipeline, per source, in this order:
 *
 *   1. **Licence gate.** The declared id must be on the allowlist. A source whose
 *      licence is not permitted never reaches the network.
 *   2. **Fetch at a pinned ref.** The revision in `sources.json` is a commit sha.
 *      A live fetch is never a build input — the snapshot is.
 *   3. **Privacy gate.** Every item is scanned. A finding quarantines the item and
 *      is recorded with its pattern; the text is never modified.
 *   4. **Source-level drop.** If more than 5% of a source's items are quarantined,
 *      the source is dropped rather than filtered. The source is the problem.
 *   5. **Snapshot.** What survives is written to `snapshots/<sha256>.json` and
 *      named by the hash of its own contents, so the artifact is immutable and a
 *      re-run either reproduces it or produces a different file that says so.
 *
 * What it does not do: it does not turn documents into procedures. That is
 * `build-tenant.mjs`, and it is deliberately separate — harvesting is fetching and
 * gating, and mixing the two would make it impossible to tell whether a corpus
 * changed because a source changed or because the summariser did.
 *
 * Usage:
 *   node tooling/corpus/harvest.mjs                     # every source in sources.json
 *   node tooling/corpus/harvest.mjs k8s-tasks-en        # named sources only
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkLicence, loadAllowlist, redistributionPolicy } from './licence-gate.mjs';
import { SOURCE_QUARANTINE_LIMIT, scanForPii } from './pii-gate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const snapshotsDir = resolve(here, 'snapshots');
const manifestPath = resolve(here, 'manifest.json');
const sourcesPath = resolve(here, 'sources.json');

const USER_AGENT = 'live-support-assistant-corpus-harvester (+https://github.com/HatemIsmailShalaby1979/LIVE-Support-Assistant)';

/** Documents larger than this are skipped: a book is not a support procedure. */
const MAX_DOCUMENT_BYTES = 200_000;

/** Be a good citizen. Unauthenticated GitHub allows 60 requests an hour. */
const REQUEST_DELAY_MS = 350;

const sleep = (ms) => new Promise((settle) => setTimeout(settle, ms));

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return response.json();
}

async function getText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return response.text();
}

/**
 * List the documents under a source's path, at a pinned ref.
 *
 * Uses the Git Trees API, which returns the whole repository tree in **one**
 * request. The contents API needs one request per directory, and the Kubernetes
 * website alone has seventeen subdirectories under `content/en/docs/tasks/`,
 * times four localised trees — enough to exhaust the unauthenticated rate limit
 * (60/hour) before a single document is fetched. The first attempt at this walked
 * directories and ran the limit down to 34 with nothing harvested.
 *
 * One API call per source, then `raw.githubusercontent.com` for the bytes, which
 * is a different host and is not rate-limited.
 *
 * The extension list is per source because these projects publish in different
 * formats and a hardcoded `.md` silently harvests nothing: Django's FAQ is
 * `.txt`, CPython's is `.rst`. A source that matches no files is reported rather
 * than passed over — the first harvest of Django returned "0 item(s)" and looked
 * like a clean empty result.
 */
async function listDocuments(source) {
  const tree = await getJson(
    `https://api.github.com/repos/${source.repo}/git/trees/${source.ref}?recursive=1`,
  );

  if (!Array.isArray(tree.tree)) {
    throw new Error(`${source.repo}: the tree response carried no tree array`);
  }

  const extensions = source.extensions ?? ['.md'];
  const prefix = source.path.endsWith('/') ? source.path : `${source.path}/`;

  return tree.tree
    .filter((entry) => entry.type === 'blob')
    .filter((entry) => entry.path.startsWith(prefix))
    .filter((entry) => extensions.some((extension) => entry.path.endsWith(extension)))
    .map((entry) => ({
      path: entry.path,
      name: entry.path.split('/').pop(),
      rawUrl: `https://raw.githubusercontent.com/${source.repo}/${source.ref}/${entry.path}`,
      size: entry.size,
    }));
}

/** Strip YAML front matter, Hugo shortcodes and reStructuredText markup. */
function extractProse(document) {
  let text = document;

  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3);
    if (end !== -1) text = text.slice(end + 4);
  }

  return (
    text
      // Hugo shortcodes: {{< ... >}} and {{% ... %}}
      .replace(/\{\{[%<][\s\S]*?[%>]\}\}/g, ' ')
      // reStructuredText directives and their indented bodies
      .replace(/^\s*\.\.\s+\w+::.*(?:\n(?:\s{3,}.*|\s*))*/gm, ' ')
      // reStructuredText roles: :ref:`text` -> text
      .replace(/:\w+:`([^`]*)`/g, '$1')
      // reStructuredText section underlines (===, ---, ~~~, ^^^, """)
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
      .trim()
  );
}

async function harvestSource(source, allowlist) {
  const licence = checkLicence(source.licence, allowlist);

  if (!licence.allowed) {
    return { source, status: 'excluded', reason: licence.reason, items: [], exclusions: [] };
  }

  const policy = redistributionPolicy(licence.entry);
  const listed = await listDocuments(source);

  // A source that matches no documents is reported, not passed over. The first
  // Django harvest returned "0 item(s)" and read as a clean empty result; the
  // real cause was a hardcoded `.md` filter against a `.txt` corpus.
  if (listed.length === 0) {
    return {
      source,
      status: 'no-documents',
      reason:
        `no file under ${source.path} matched ` +
        `${(source.extensions ?? ['.md']).join(' or ')} at ${source.ref.slice(0, 12)}`,
      items: [],
      exclusions: [],
      quarantined: [],
    };
  }

  const items = [];
  const exclusions = [];
  const quarantined = [];

  for (const entry of listed) {
    await sleep(REQUEST_DELAY_MS);

    let markdown;
    try {
      markdown = await getText(entry.rawUrl);
    } catch (error) {
      exclusions.push({ path: entry.path, reason: `fetch failed: ${error}` });
      continue;
    }

    if (Buffer.byteLength(markdown, 'utf8') > MAX_DOCUMENT_BYTES) {
      exclusions.push({ path: entry.path, reason: `larger than ${MAX_DOCUMENT_BYTES} bytes` });
      continue;
    }

    const text = extractProse(markdown);

    if (text.length < 200) {
      exclusions.push({ path: entry.path, reason: 'too little prose after extraction' });
      continue;
    }

    const scan = scanForPii(text);

    if (!scan.clean) {
      quarantined.push({ path: entry.path, findings: scan.findings });
      continue;
    }

    items.push({
      path: entry.path,
      name: entry.name,
      language: source.language,
      sourceId: source.id,
      licence: source.licence,
      textSha256: sha256(text),
      text,
    });
  }

  const considered = items.length + quarantined.length;

  // The source-drop rate counts HIGH-severity findings only, under prereg g10.
  //
  // The item rule is untouched: everything in `quarantined` is out of the corpus
  // regardless of severity. This decides only whether the whole source is
  // discarded, and it changed because 5% of an eight-document source is one
  // document — a single deliberately published contact address was dropping the
  // whole thing.
  const quarantinedHigh = quarantined.filter((entry) =>
    entry.findings.some((finding) => finding.severity === 'high'),
  ).length;
  const rateHigh = considered === 0 ? 0 : quarantinedHigh / considered;
  const rateAny = considered === 0 ? 0 : quarantined.length / considered;

  if (rateHigh > SOURCE_QUARANTINE_LIMIT) {
    return {
      source,
      status: 'dropped',
      reason:
        `high-severity quarantine rate ${(rateHigh * 100).toFixed(1)}% exceeds the ` +
        `${(SOURCE_QUARANTINE_LIMIT * 100).toFixed(0)}% limit ` +
        `(any-severity rate ${(rateAny * 100).toFixed(1)}%)`,
      items: [],
      exclusions,
      quarantined,
    };
  }

  return {
    source,
    status: 'harvested',
    redistribution: policy,
    items,
    exclusions,
    quarantined,
    quarantineRate: rateHigh,
    quarantineRateAny: rateAny,
  };
}

// ---------------------------------------------------------------------------

const requested = process.argv.slice(2);
const registry = JSON.parse(readFileSync(sourcesPath, 'utf8'));
const allowlist = loadAllowlist();
const selected = requested.length === 0
  ? registry.sources
  : registry.sources.filter((source) => requested.includes(source.id));

if (selected.length === 0) {
  process.stderr.write(`no source matched: ${requested.join(', ')}\n`);
  process.exit(2);
}

mkdirSync(snapshotsDir, { recursive: true });

const manifestSources = [];

for (const source of selected) {
  process.stdout.write(`==> ${source.id} (${source.repo}@${source.ref.slice(0, 12)} ${source.path})\n`);

  let outcome;
  try {
    outcome = await harvestSource(source, allowlist);
  } catch (error) {
    process.stdout.write(`    FAILED — ${error}\n\n`);
    manifestSources.push({ id: source.id, status: 'failed', reason: String(error) });
    continue;
  }

  if (outcome.status !== 'harvested') {
    process.stdout.write(`    ${outcome.status.toUpperCase()} — ${outcome.reason}\n\n`);
    manifestSources.push({
      id: source.id,
      status: outcome.status,
      reason: outcome.reason,
      excluded: outcome.exclusions.length,
      quarantined: (outcome.quarantined ?? []).length,
      // Recorded for a dropped source too, and named. The first harvest kept only
      // the count, so diagnosing why a source was dropped meant re-fetching the
      // whole thing — which is the opposite of what a provenance record is for.
      quarantine_detail: (outcome.quarantined ?? []).map((entry) => ({
        path: entry.path,
        patterns: entry.findings.map((finding) => finding.pattern),
        examples: entry.findings.slice(0, 2).map((finding) => finding.match),
      })),
      exclusion_detail: outcome.exclusions,
    });
    continue;
  }

  const snapshotBody = {
    data_mode: 'web-sourced',
    sourceId: source.id,
    tenant: source.tenant,
    domain_analogue: source.domain_analogue,
    language: source.language,
    repo: source.repo,
    ref: source.ref,
    path: source.path,
    licence: source.licence,
    licence_url: source.licence_url,
    licence_read_at: source.licence_read_at,
    licence_evidence: source.licence_evidence,
    attribution: source.attribution,
    // No `harvested_at` here, deliberately. The file is named by the SHA-256 of
    // its own contents, and a timestamp inside it changes the hash on every run —
    // which makes the name meaningless and "re-running reproduces the file"
    // false. When the fetch happened is a fact about the run, so it lives in the
    // manifest; what the bytes are is a fact about the artifact, and it lives
    // here.
    items: outcome.items,
  };

  const body = `${JSON.stringify(snapshotBody, null, 2)}\n`;
  const snapshotSha = sha256(body);
  const snapshotFile = `snapshots/${snapshotSha}.json`;
  const snapshotPath = resolve(here, snapshotFile);

  // Content-addressed: the same source at the same ref produces the same file.
  // A second run writes the same bytes or it produced different bytes, and either
  // way the name says which.
  if (!existsSync(snapshotPath)) {
    writeFileSync(snapshotPath, body, 'utf8');
  }

  process.stdout.write(
    `    harvested ${outcome.items.length} item(s); ` +
      `${outcome.exclusions.length} excluded, ${outcome.quarantined.length} quarantined ` +
      `(${(outcome.quarantineRate * 100).toFixed(1)}%)\n` +
      `    snapshot ${snapshotFile}\n\n`,
  );

  manifestSources.push({
    id: source.id,
    status: 'harvested',
    tenant: source.tenant,
    domain_analogue: source.domain_analogue,
    language: source.language,
    repo: source.repo,
    ref: source.ref,
    path: source.path,
    licence: source.licence,
    licence_url: source.licence_url,
    licence_read_at: source.licence_read_at,
    attribution: source.attribution,
    redistribute_text: outcome.redistribution.commitText,
    redistribute_reason: outcome.redistribution.reason,
    snapshot: snapshotFile,
    snapshotSha256: snapshotSha,
    // When the fetch happened. It belongs here rather than inside the snapshot,
    // which is content-addressed and would otherwise change hash on every run.
    harvested_at: new Date().toISOString(),
    items: outcome.items.length,
    excluded: outcome.exclusions.length,
    quarantined: outcome.quarantined.length,
    quarantine_rate: Number(outcome.quarantineRate.toFixed(4)),
    quarantine_rate_any: Number(outcome.quarantineRateAny.toFixed(4)),
    exclusion_detail: outcome.exclusions,
    quarantine_detail: outcome.quarantined.map((entry) => ({
      path: entry.path,
      patterns: entry.findings.map((finding) => finding.pattern),
    })),
  });
}

// Preserve any source the manifest already knows about but this run did not touch,
// so a single-source re-harvest does not silently shrink the fleet.
let previous = { sources: [] };
try {
  previous = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch {
  // No manifest yet: this is the first harvest.
}

const touched = new Set(manifestSources.map((entry) => entry.id));
const untouched = (previous.sources ?? []).filter((entry) => !touched.has(entry.id));

const manifest = {
  note:
    'Corpus manifest. Every harvested source records the licence it was read under, when it was ' +
    'read, what the licence file actually said, the pinned revision, and the hash of the snapshot ' +
    'its own contents produced. Exclusions and quarantines are counted and named rather than ' +
    'silently dropped.',
  data_mode: 'web-sourced',
  generated_at: new Date().toISOString(),
  quarantine_limit: SOURCE_QUARANTINE_LIMIT,
  sources: [...untouched, ...manifestSources].sort((left, right) => left.id.localeCompare(right.id)),
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const harvested = manifest.sources.filter((entry) => entry.status === 'harvested');
const totalItems = harvested.reduce((sum, entry) => sum + entry.items, 0);

process.stdout.write(
  `manifest: ${harvested.length} harvested, ` +
    `${manifest.sources.filter((entry) => entry.status !== 'harvested').length} not harvested, ` +
    `${totalItems} item(s) total\n`,
);
