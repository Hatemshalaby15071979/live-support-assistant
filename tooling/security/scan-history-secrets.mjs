#!/usr/bin/env node
/**
 * scan-history-secrets.mjs — repeatable full-history secret/PII pickaxe.
 *
 * Why: the standing push rule (AGENTS.md "Standing authorization") requires a clean
 * full-history scan of the exact candidate branch before any push. The 2026-10-11 record
 * (docs/program/FAILURES/2026-10-11-full-history-secret-scan.md) covered HEAD d1d6052 only;
 * the candidate head moved on. A scan is evidence about the revision it names, so it must be
 * re-run, not re-quoted.
 *
 * What it does: walks `git log -p` for every commit reachable from <rev>, inspects every
 * ADDED and REMOVED line — i.e. every line ever introduced anywhere in that history — and
 * classifies candidates. Matched values are redacted before printing; email local-parts are
 * never printed, only domains.
 *
 * HARDENED 2026-10-12 (Task A2/A4). The first release exempted any credential-shaped URL
 * whose user or password atom was an exact placeholder word (`pass`, `token`, …) or whose host
 * was on a placeholder-host list. That is a false-negative class: a real credential such as a
 * URL using `pass` as the user and `token` as the password against a real host would have been
 * exempted. Generic exemptions are REMOVED.
 *
 * The fixed in-repository triage registry (JSON, committed at
 * tooling/security/history-scan-exceptions.json) never exempts a hit. It records review only.
 * A triage entry binds the occurrence plus two distinct human GitHub login identifiers:
 *
 *   commit      the exact full SHA of the commit that introduced the occurrence
 *   path        the exact repository-relative file path of the changed file
 *   op          'added' or 'removed' — the diff-line occurrence type
 *   lineSha256  SHA-256 of the normalized diff-line content (normalization below)
 *
 * A matching triage entry remains a hard hit. A near-miss, unreviewed hit, or stale registry
 * entry also fails closed. No caller-supplied registry path is accepted.
 *
 * Normalization rule for lineSha256: take the diff line, remove the single leading '+' or '-'
 * marker, convert CRLF to LF, strip trailing whitespace, hash the UTF-8 bytes with SHA-256.
 *
 * Registry integrity: every registry entry must be matched by at least one real occurrence
 * during the scan. An entry that never matches means the registry no longer describes this
 * history — the scan fails closed (exit 2) instead of reporting a clean result.
 *
 * FAIL-CLOSED behaviour (never report a clean scan that did not complete):
 *   git exits non-zero                      → exit 2
 *   git writes to stderr                    → exit 2
 *   commit-count mismatch (truncated diff)  → exit 2
 *   stale / unmatched exception entry       → exit 2
 *   git cannot be spawned                   → exit 2
 *
 * Usage:
 *   node tooling/security/scan-history-secrets.mjs [--json <path>] [--strict]
 *        [--exceptions <path>] [--git <path>]
 *   --strict       accepted for compatibility; strict reporting is always enabled
 *   --exceptions   rejected; the registry path is pinned inside the repository
 *   --git          git binary path (test seam; default: `git` on PATH)
 *
 * Precedent for admissible exceptions (set 2026-10-12, Task C/D): an occurrence may be registered only
 * when a human has read it and dispositioned it, and it is identified exactly — commit + path + op +
 * content hash. "It is in a test file", "it looks like a placeholder", and "the host is example.com" are
 * NOT dispositions. The scanner's own control suite once tripped this rule by planting literal fixtures;
 * it was rewritten to construct its fixtures from parts, and the immutable historical occurrences were
 * registered individually rather than exempted by file. A reintroduced literal fails closed.
 *
 * Exit codes: 0 = completed, no hard hit · 1 = completed, hard hit(s) · 2 = did not complete.
 *
 * Known limitation (documented, not hidden): binary file content is not inspected; `git log -p`
 * prints only a "Binary files … differ" marker for blobs.
 *
 * No dependencies. Async spawn only (spawnSync fails EBUSY on this host).
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync, readFileSync, existsSync, lstatSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export const CATEGORIES = [
  { id: 'private-key-block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, hard: true },
  { id: 'jwt-shape', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}/, hard: true },
  { id: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/, hard: true },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/, hard: true },
  { id: 'supabase-secret-key', re: /\bsb_(secret|publishable)_[A-Za-z0-9_-]{10,}/, hard: true },
  { id: 'credential-url', re: /\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/, hard: true },
  { id: 'password-assignment', re: /\b(pass(word|wd|phrase)?|pwd)\b\s*[:=]\s*["'][^"']{4,}["']/i, hard: true },
  { id: 'secret-assignment', re: /\b(api[_-]?key|secret|token|access[_-]?key|service[_-]?role)\b\s*[:=]\s*["'][A-Za-z0-9_.-]{16,}["']/i, hard: true },
  { id: 'db-host-ref', re: /\b[a-z]{20}\.supabase\.(co|in)\b|\bdb\.[a-z]{20}\.supabase\.co\b/, hard: true },
  { id: 'email-address', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, hard: true },
  { id: 'openai-api-key', re: /\bsk-[A-Za-z0-9_-]{12,}\b/, hard: true },
  { id: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/, hard: true },
  { id: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{12,}\b/, hard: true },
  { id: 'high-entropy-assignment', re: /\b(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key)\b\s*[:=]\s*["']?([A-Za-z0-9_+/=-]{32,})/i, hard: true },
];

const EMAIL_SAFE_DOMAIN = /(^|\.)(example\.(com|org|net)|example|invalid|test|localhost)$/i;

/** Normalize a diff-line body (marker removed) and return its content hash. */
export function normalizeAndHash(content) {
  const normalized = content.replace(/\r\n$/, '').replace(/\r$/, '').replace(/[ \t]+$/, '');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/** Keep the shape, hide the value. */
export function redact(s) {
  const t = s.trim();
  if (t.length <= 8) return '*'.repeat(t.length);
  return `${t.slice(0, 4)}${'*'.repeat(Math.min(12, t.length - 6))}${t.slice(-2)}`;
}

/** One changed line classified against one category. Returns null or a hit record. */
export function classify(body, cat) {
  const m = body.match(cat.re);
  if (!m) return null;
  if (cat.id === 'high-entropy-assignment' && shannonEntropy(m[1]) < 3.5) return null;
  const raw = m[0];
  if (cat.id === 'email-address') {
    const domain = raw.split('@')[1] || '';
    const reserved = EMAIL_SAFE_DOMAIN.test(domain);
    return { value: `<local-part>@${domain}`, hard: cat.hard && !reserved, safeClass: reserved ? 'reserved example/test domain' : null };
  }
  return { value: redact(raw), hard: cat.hard, safeClass: null };
}

function shannonEntropy(value) {
  const n = value.length;
  if (n === 0) return 0;
  const counts = new Map();
  for (const ch of value) counts.set(ch, (counts.get(ch) || 0) + 1);
  return [...counts.values()].reduce((sum, count) => {
    const p = count / n;
    return sum - p * Math.log2(p);
  }, 0);
}

export function loadExceptions(path) {
  if (!existsSync(path)) throw new Error('pinned triage registry is missing');
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (Array.isArray(parsed)) return parsed;
  return parsed.exceptions || parsed.entries || [];
}

export function validateTriageRegistry(entries) {
  if (!Array.isArray(entries)) return ['triage registry must be an array'];
  const errors = [];
  const idPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
  const agentPattern = /(?:agent|bot|automation|system)/i;
  for (const [index, entry] of entries.entries()) {
    const prefix = `entry ${index + 1}`;
    if (!entry || typeof entry !== 'object') { errors.push(`${prefix} must be an object`); continue; }
    if (!entry.id || !entry.commit || !entry.path || !['added','removed'].includes(entry.op) || !/^[a-f0-9]{64}$/i.test(entry.lineSha256 || '')) errors.push(`${prefix} is missing an exact occurrence identity`);
    const triagePath = String(entry.path || '').replaceAll('\\', '/');
    if (triagePath.startsWith('/') || triagePath.split('/').includes('..') || /^tooling\//i.test(triagePath)) errors.push(`${prefix} may not point into tooling/ or escape the repository`);
    const first = String(entry.reviewedBy || '');
    const second = String(entry.approvedBy || '');
    if (!idPattern.test(first) || !idPattern.test(second) || first.toLowerCase() === second.toLowerCase() || agentPattern.test(first) || agentPattern.test(second)) errors.push(`${prefix} requires two distinct human GitHub login identifiers`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedAt || '') || !String(entry.disposition || '').trim()) errors.push(`${prefix} requires reviewedAt and a disposition`);
  }
  return errors;
}

/**
 * Walk the full patch stream of <rev>. `gitRun(argv)` must resolve to {code, out, err}.
 * `out` may be the complete text; the walker splits it line by line exactly as the CLI does.
 * `-m` shows each merge against every parent, so content introduced by an evil merge or a
 * conflict resolution is inspected too. Returns every occurrence with commit/path/op/content
 * identity attached, plus the set of commit SHAs whose diff was seen.
 */
export function walkDiff({ rev, gitRun }) {
  return gitRun(['log', '--all', '-p', '-m', '--no-color', '--format=@@@%H|%aI|%s']).then((res) => {
    const occurrences = [];
    const seenCommits = new Set();
    const lines = String(res.out).split('\n');
    let full = '?';
    let date = '';
    let file = '?';
    let pendingFile = '?';
    let inHeader = false;
    let changedLines = 0;

    for (const line of lines) {
      if (line.startsWith('@@@')) {
        full = line.slice(3).split('|')[0].trim();
        date = line.slice(3).split('|')[1]?.slice(0, 10) || '';
        if (full && full !== '?') seenCommits.add(full);
        file = '?';
        inHeader = false;
        continue;
      }
      if (line.startsWith('diff --git ')) {
        file = '?';
        pendingFile = '?';
        inHeader = true;
        continue;
      }
      // Only interpret +++/--- as file headers INSIDE a diff header block; otherwise an added
      // line whose own content begins with "++ " or "-- " would be skipped (a real miss).
      if (inHeader && line.startsWith('--- ')) {
        pendingFile = line.startsWith('--- a/') ? line.slice(6) : '<new-file>';
        continue;
      }
      if (inHeader && line.startsWith('+++ ')) {
        file = line.startsWith('+++ b/') ? line.slice(6) : `<deleted:${pendingFile}>`;
        continue;
      }
      if (line.startsWith('@@')) {
        inHeader = false;
        continue;
      }
      if (!(line.startsWith('+') || line.startsWith('-'))) continue;
      if (line.length === 1) continue;
      const op = line[0] === '+' ? 'added' : 'removed';
      const body = line.slice(1);
      changedLines += 1;
      for (const cat of CATEGORIES) {
        const hit = classify(body, cat);
        if (!hit) continue;
        occurrences.push({
          commit: full,
          file,
          op,
          body,
          contentHash: normalizeAndHash(body),
          category: cat.id,
          hard: hit.hard,
          value: hit.value,
          safeClass: hit.safeClass || null,
        });
      }
    }

    return {
      completed: res.code === 0 && !res.err,
      code: res.code,
      stderrText: res.err || '',
      commitCountMarkers: lines.filter((l) => l.startsWith('@@@')).length,
      seenCommits: [...seenCommits],
      changedLines,
      occurrences,
    };
  });
}

/**
 * Apply the exact exception registry. Returns counts, matched ids and exception events.
 * An occurrence is exempted only when commit + path + op + content hash all match an entry.
 */
export function evaluate(walk, { exceptions = [] }) {
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]));
  const hardCounts = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]));
  const details = Object.fromEntries(CATEGORIES.map((c) => [c.id, []]));
  const domains = new Map();
  const matched = new Set();
  const exceptionEvents = [];

  for (const occ of walk.occurrences) {
    counts[occ.category] += 1;
    const hard = occ.hard;
    let note = occ.safeClass || null;
    const entry = exceptions.find((e) => e.commit === occ.commit && e.path === occ.file && e.op === occ.op && e.lineSha256 === occ.contentHash);
    if (entry) {
      note = `triaged by ${entry.reviewedBy} and ${entry.approvedBy} — ${entry.disposition}`;
      matched.add(entry.id);
      exceptionEvents.push(`${entry.id} ${occ.commit.slice(0, 12)} ${occ.op} ${occ.file} (still hard)`);
    }
    if (hard) hardCounts[occ.category] += 1;
    if (occ.category === 'email-address') domains.set(occ.value.split('@')[1], (domains.get(occ.value.split('@')[1]) || 0) + 1);
    if (details[occ.category].length < 25) {
      details[occ.category].push(`${occ.commit.slice(0, 12)} ${occ.date || ''} ${occ.op} ${occ.file} :: ${occ.value}${note ? `  [${note}]` : ''}`);
    }
  }

  return { counts, hardCounts, details, domains, matched, exceptionEvents };
}

/**
 * Compose walk + the expected commit set + registry into a pass/fail decision.
 * Exported so tests can exercise the fail-closed rules without a real repository.
 * `expectedCommits` is the list of commit SHAs `git rev-list <rev>` reports; every one of
 * them must appear as a marker in the diff, otherwise the walk was incomplete.
 * Returns { ok, reasons, result, hardHits } where ok=false means "did not complete".
 */
export function audit({ walk, expectedCommits = [], exceptions = [] }) {
  const reasons = [];
  if (!walk.completed) reasons.push(`git exited ${walk.code}${walk.stderrText ? `: ${walk.stderrText.trim().slice(0, 120)}` : ''}`);
  if (walk.stderrText && String(walk.stderrText).trim()) reasons.push('git wrote to stderr');
  const seen = new Set(walk.seenCommits || []);
  const missing = expectedCommits.filter((sha) => !seen.has(sha));
  if (missing.length > 0) {
    reasons.push(`diff incomplete — ${missing.length} of ${expectedCommits.length} commits produced no diff (e.g. ${missing.slice(0, 3).join(', ')})`);
  }
  const result = evaluate(walk, { exceptions });
  const hardHits = CATEGORIES.reduce((n, c) => n + result.hardCounts[c.id], 0);
  const stale = exceptions.filter((e) => !result.matched.has(e.id));
  if (stale.length > 0) reasons.push(`${stale.length} triage-registry entry(s) matched nothing (stale): ${stale.map((e) => e.id).join(', ')}`);
  return { ok: reasons.length === 0, reasons, result, hardHits, stale };
}

function gitBufferRun(gitBin, argv) {
  return new Promise((resolve, reject) => {
    const p = spawn(gitBin, argv, { cwd: process.cwd(), windowsHide: true });
    const out = [];
    const err = [];
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => err.push(d));
    p.on('error', reject);
    p.on('close', (code) => resolve({ code, out: Buffer.concat(out), err: Buffer.concat(err).toString('utf8') }));
  });
}

function isBinary(data) {
  if (data.includes(0)) return true;
  try { new TextDecoder('utf-8', { fatal: true }).decode(data); return false; }
  catch { return true; }
}

/** Scan binaries and objects not reachable from any ref, without printing matched bytes. */
export async function scanStoredObjects({ gitRun, gitBin = 'git' }) {
  const reachableRes = await gitRun(['rev-list', '--objects', '--all']);
  if (reachableRes.code !== 0 || reachableRes.err) return { completed: false, reason: 'could not enumerate ref-reachable objects', hits: [], objectsScanned: 0 };
  const reachable = new Set(String(reachableRes.out).split('\n').map((line) => line.split(' ', 1)[0]).filter(Boolean));
  const allRes = await gitBufferRun(gitBin, ['cat-file', '--batch-all-objects', '--batch']);
  if (allRes.code !== 0 || allRes.err) return { completed: false, reason: 'could not enumerate all stored objects', hits: [], objectsScanned: 0 };

  const hits = [];
  let objectsScanned = 0;
  let pos = 0;
  while (pos < allRes.out.length) {
    const end = allRes.out.indexOf(10, pos);
    if (end < 0) return { completed: false, reason: 'truncated object header', hits, objectsScanned };
    const [oid, type, rawSize] = allRes.out.subarray(pos, end).toString('ascii').split(' ');
    const size = Number(rawSize);
    pos = end + 1;
    if (!oid || !type || !Number.isSafeInteger(size) || size < 0 || pos + size >= allRes.out.length) {
      return { completed: false, reason: 'invalid or truncated object record', hits, objectsScanned };
    }
    const data = allRes.out.subarray(pos, pos + size);
    pos += size + 1;
    const isReachable = reachable.has(oid);
    if (isReachable && !(type === 'blob' && isBinary(data))) continue;
    objectsScanned += 1;
    const text = data.toString('latin1');
    for (const cat of CATEGORIES) {
      const hit = classify(text, cat);
      if (hit) hits.push({ object: oid, type, category: cat.id, hard: cat.hard, value: hit.value });
    }
  }
  return { completed: true, hits, objectsScanned };
}

async function main() {
  const args = process.argv.slice(2);
  const jsonIdx = args.indexOf('--json');
  const jsonPath = jsonIdx >= 0 ? args[jsonIdx + 1] : null;
  const strict = true;
  const gitIdx = args.indexOf('--git');
  const gitBin = gitIdx >= 0 ? args[gitIdx + 1] : 'git';
  const excIdx = args.indexOf('--exceptions');
  const positional = args.filter((a, i) => !a.startsWith('--')
    && !(jsonIdx >= 0 && i === jsonIdx + 1)
    && !(gitIdx >= 0 && i === gitIdx + 1));
  if (excIdx >= 0 || positional.length > 0) {
    console.error('SCAN DID NOT COMPLETE: scan scope and triage registry path are pinned; positional revisions and --exceptions are not accepted.');
    process.exit(2);
  }

  const gitRun = (argv) => new Promise((resolve, reject) => {
    const p = spawn(gitBin, argv, { cwd: process.cwd(), windowsHide: true });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { out += d.toString('utf8'); });
    p.stderr.on('data', (d) => { err += d.toString('utf8'); });
    p.on('error', reject);
    p.on('close', (code) => resolve({ code, out, err }));
  });

  try {
    const rootRes = await gitRun(['rev-parse', '--show-toplevel']);
    if (rootRes.code !== 0) {
      console.error(`SCAN DID NOT COMPLETE: git rev-parse exited ${rootRes.code}: ${rootRes.err.trim().slice(0, 200)}`);
      process.exit(2);
    }
    const repoRoot = realpathSync(rootRes.out.trim());
    const exceptionsPath = resolve(repoRoot, 'tooling/security/history-scan-exceptions.json');
    const registryStat = lstatSync(exceptionsPath);
    if (!registryStat.isFile() || registryStat.isSymbolicLink() || !realpathSync(exceptionsPath).startsWith(`${repoRoot}/`)) {
      console.error('SCAN DID NOT COMPLETE: pinned triage registry must be a regular file inside the repository.');
      process.exit(2);
    }

    let exceptions = [];
    try {
      exceptions = loadExceptions(exceptionsPath);
    } catch (e) {
      console.error(`SCAN DID NOT COMPLETE: exception registry unreadable (${exceptionsPath}): ${e.message}`);
      process.exit(2);
    }
    const registryErrors = validateTriageRegistry(exceptions);
    if (registryErrors.length > 0) {
      console.error('SCAN DID NOT COMPLETE: invalid triage registry:');
      for (const error of registryErrors) console.error(`    ${error}`);
      process.exit(2);
    }

    const listRes = await gitRun(['rev-list', '--all']);
    if (listRes.code !== 0) {
      console.error(`SCAN DID NOT COMPLETE: git rev-list --all exited ${listRes.code}: ${listRes.err.trim().slice(0, 200)}`);
      process.exit(2);
    }
    const expectedCommits = listRes.out.split('\n').map((s) => s.trim()).filter(Boolean);
    if (expectedCommits.length === 0) {
      console.error('SCAN DID NOT COMPLETE: git rev-list --all reported no commits.');
      process.exit(2);
    }

    const walk = await walkDiff({ rev: '--all', gitRun });
    const check = audit({ walk, expectedCommits, exceptions });
    if (!check.ok) {
      console.error('SCAN DID NOT COMPLETE:');
      for (const r of check.reasons) console.error(`    ${r}`);
      console.error('Nothing here is a clean result.');
      process.exit(2);
    }
    const objectScan = await scanStoredObjects({ gitRun, gitBin });
    if (!objectScan.completed) {
      console.error(`SCAN DID NOT COMPLETE: ${objectScan.reason}`);
      process.exit(2);
    }
    const result = check.result;
    const objectHardHits = objectScan.hits.filter((hit) => hit.hard).length;
    const hardHits = check.hardHits + objectHardHits;

    const report = {
      tool: 'scan-history-secrets.mjs',
      hardening: 'all refs; strict; fixed in-repository triage registry; binary and unreachable object scan',
      rev: '--all',
      repoRoot,
      exceptionsPath,
      strict,
      scannedAt: new Date().toISOString(),
      commits: walk.seenCommits.length,
      changedLinesInspected: walk.changedLines,
      counts: result.counts,
      hardCounts: result.hardCounts,
      hardHits,
      exceptionsRegistered: exceptions.length,
      exceptionEvents: result.exceptionEvents,
      integrity: { completed: true, expectedCommits: expectedCommits.length, seenCommits: walk.seenCommits.length, staleTriage: 0 },
      storedObjects: { scanned: objectScan.objectsScanned, hardHits: objectHardHits, hits: objectScan.hits },
      emailDomains: Object.fromEntries([...result.domains.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
      details: result.details,
    };

    console.log('# history secret scan — all refs (STRICT; every hit remains hard)');
    console.log(`commits scanned: ${walk.seenCommits.length} of ${expectedCommits.length}   changed lines inspected: ${walk.changedLines}   triage records: ${exceptions.length}   stored objects scanned: ${objectScan.objectsScanned}`);
    console.log('');
    if (result.exceptionEvents.length > 0) {
      console.log('TRIAGE RECORDS MATCHED (these occurrences remain hard hits):');
      for (const e of result.exceptionEvents) console.log(`    ${e}`);
      console.log('');
    }
    for (const hit of objectScan.hits) {
      console.log(`stored-object ${hit.type} ${hit.object.slice(0, 12)} ${hit.category} ${hit.hard ? 'HARD-HIT' : 'REVIEW'}`);
    }
    for (const cat of CATEGORIES) {
      const n = result.counts[cat.id];
      const h = result.hardCounts[cat.id];
      const tag = cat.hard ? (h > 0 ? `HARD-HIT ${h}` : 'clean') : n > 0 ? 'REVIEW' : 'clean';
      console.log(`${cat.id.padEnd(20)} ${String(n).padStart(6)}  ${tag}`);
      for (const d of result.details[cat.id]) console.log(`    ${d}`);
      if (result.counts[cat.id] > result.details[cat.id].length) {
        console.log(`    … ${result.counts[cat.id] - result.details[cat.id].length} more (truncated)`);
      }
    }
    console.log('');
    if (result.domains.size > 0) {
      console.log('email domains seen (local-parts never printed):');
      for (const [d, n] of [...result.domains.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
        console.log(`    ${String(n).padStart(5)}  ${d}`);
      }
      console.log('');
    }
    console.log(hardHits === 0 ? 'VERDICT: no hard-category hit' : `VERDICT: ${hardHits} HARD-CATEGORY HIT(S) — do not push`);

    if (jsonPath) {
      writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      console.log(`json written: ${jsonPath}`);
    }
    process.exit(hardHits === 0 ? 0 : 1);
  } catch (err) {
    console.error(`SCAN DID NOT COMPLETE: ${err.message}`);
    process.exit(2);
  }
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (invokedDirectly || process.argv[1]?.endsWith('scan-history-secrets.mjs')) {
  main();
}
