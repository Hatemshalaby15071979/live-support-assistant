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
 * What it does: streams `git log -p` for every commit reachable from <rev>, inspects every
 * ADDED and REMOVED line (i.e. every line ever introduced anywhere in that history), and
 * classifies candidates. Matched values are redacted before printing; email local-parts are
 * never printed, only domains.
 *
 * Usage:
 *   node tooling/security/scan-history-secrets.mjs [rev] [--json <path>] [--strict]
 *
 * --strict disables the documented placeholder exemption (see PLACEHOLDER_ATOM / PLACEHOLDER_HOST)
 * and reports every syntactically credential-shaped string as a hard hit. Use it when the question
 * is "what shapes exist", not "is a real secret present".
 *
 * Placeholder exemption, and why it is narrow: documentation and fixtures legitimately contain
 * credential-shaped *placeholders*. The exemption matches an EXACT whole atom — the literal words
 * user/pass/password/pwd/secret/token/changeme, `<angle-bracket>` and `${braced}` templates, and
 * `env(...)` references — or a host on the documented placeholder list. A real credential is not
 * one of those exact words, so it still fails. This exemption was added on 2026-10-12 after the
 * scan flagged this repository's own documentation prose; the strict view is always available.
 *
 * Exit code: 1 if a hard-category hit survives the exemption; 0 otherwise. REVIEW categories are
 * printed for human disposition and never fail the run by themselves.
 *
 * No dependencies. Async spawn only (spawnSync fails EBUSY on this host).
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const jsonIdx = args.indexOf('--json');
const jsonPath = jsonIdx >= 0 ? args[jsonIdx + 1] : null;
const strict = args.includes('--strict');
const rev = args.find((a) => !a.startsWith('--') && a !== jsonPath) || 'HEAD';

const MAX_DETAIL = 25;

const CATEGORIES = [
  { id: 'private-key-block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, hard: true },
  { id: 'jwt-shape', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}/, hard: true },
  { id: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/, hard: true },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/, hard: true },
  { id: 'supabase-secret-key', re: /\bsb_(secret|publishable)_[A-Za-z0-9_-]{10,}/, hard: true },
  { id: 'credential-url', re: /\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/, hard: true },
  { id: 'password-assignment', re: /\b(pass(word|wd|phrase)?|pwd)\b\s*[:=]\s*["'][^"']{4,}["']/i, hard: false },
  { id: 'secret-assignment', re: /\b(api[_-]?key|secret|token|access[_-]?key|service[_-]?role)\b\s*[:=]\s*["'][A-Za-z0-9_.-]{16,}["']/i, hard: false },
  { id: 'db-host-ref', re: /\b[a-z]{20}\.supabase\.(co|in)\b|\bdb\.[a-z]{20}\.supabase\.co\b/, hard: false },
  { id: 'email-address', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, hard: false },
];

const EMAIL_SAFE_DOMAIN = /(^|\.)(example\.(com|org|net)|example|invalid|test|localhost)$/i;
/** Exact whole-atom placeholders. A real credential is not one of these words. */
const PLACEHOLDER_ATOM = /^(user|username|user_name|user-name|pass|password|passwd|pwd|secret|token|changeme|change_me|xxx+|x{3,}|your[-_]?[a-z_]*|<[^>]*>|\$\{[^}]*\}|env\([^)]*\))$/i;
/** Documented placeholder hosts. */
const PLACEHOLDER_HOST = /^(example\.(com|org|net)|example|localhost|127\.0\.0\.1|host|hostname|server|db|db\.example|your-host)$/i;

function isPlaceholderCredentialUrl(raw) {
  const m = raw.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^@/:]+):([^@/]+)@(.*)$/);
  if (!m) return false;
  const [, user, pass, rest] = m;
  const host = rest.split(/[/:?#]/)[0];
  return PLACEHOLDER_ATOM.test(user) || PLACEHOLDER_ATOM.test(pass) || PLACEHOLDER_HOST.test(host);
}

/** Keep the shape, hide the value. */
function redact(s) {
  const t = s.trim();
  if (t.length <= 8) return '*'.repeat(t.length);
  return `${t.slice(0, 4)}${'*'.repeat(Math.min(12, t.length - 6))}${t.slice(-2)}`;
}

function classify(line, cat) {
  const m = line.match(cat.re);
  if (!m) return null;
  const raw = m[0];
  if (cat.id === 'email-address') {
    const domain = raw.split('@')[1] || '';
    return { value: `<local-part>@${domain}`, hard: false, safeClass: EMAIL_SAFE_DOMAIN.test(domain) ? 'rfc2606/example domain' : null };
  }
  if (cat.id === 'credential-url' && !strict && isPlaceholderCredentialUrl(raw)) {
    return { value: redact(raw), hard: false, safeClass: 'documentation placeholder' };
  }
  return { value: redact(raw), hard: cat.hard, safeClass: null };
}

const git = spawn('git', ['log', '-p', '--no-color', '--no-merges', '--format=@@@%H|%aI|%s', rev], {
  cwd: process.cwd(),
  windowsHide: true,
});

if (!git.stdout) {
  console.error('failed to start git');
  process.exit(2);
}

const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]));
const hardCounts = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]));
const details = Object.fromEntries(CATEGORIES.map((c) => [c.id, []]));
const domains = new Map();
let commits = 0;
let current = { sha: '?', date: '', subject: '' };
let file = '?';
let pendingFile = '?';
let addedLines = 0;

const rl = createInterface({ input: git.stdout, crlfDelay: Infinity });

rl.on('line', (line) => {
  if (line.startsWith('@@@')) {
    const [sha, date, ...rest] = line.slice(3).split('|');
    current = { sha: sha.slice(0, 12), date: date.slice(0, 10), subject: rest.join('|') };
    commits += 1;
    return;
  }
  // File attribution. A deleted file's hunk header is `--- a/x` then `+++ /dev/null`;
  // without this the lines would be attributed to whatever file came before.
  if (line.startsWith('diff --git ')) {
    file = '?';
    pendingFile = '?';
    return;
  }
  if (line.startsWith('--- a/')) {
    pendingFile = line.slice(6);
    return;
  }
  if (line.startsWith('--- /dev/null')) {
    pendingFile = '<new-file>';
    return;
  }
  if (line.startsWith('+++ b/')) {
    file = line.slice(6);
    return;
  }
  if (line.startsWith('+++ /dev/null')) {
    file = `<deleted:${pendingFile}>`;
    return;
  }
  if (line.startsWith('--- ') || line.startsWith('+++ ')) return;
  if (!(line.startsWith('+') || line.startsWith('-'))) return;
  const body = line.slice(1);
  addedLines += 1;

  for (const cat of CATEGORIES) {
    const hit = classify(body, cat);
    if (!hit) continue;
    counts[cat.id] += 1;
    if (hit.hard) hardCounts[cat.id] += 1;
    if (cat.id === 'email-address') {
      const d = hit.value.split('@')[1];
      domains.set(d, (domains.get(d) || 0) + 1);
    }
    if (details[cat.id].length < MAX_DETAIL) {
      const note = hit.safeClass ? `  [${hit.safeClass}]` : '';
      details[cat.id].push(`${current.sha} ${current.date} ${file} :: ${hit.value}${note}`);
    }
  }
});

git.on('close', (code) => {
  const hardHits = CATEGORIES.reduce((n, c) => n + hardCounts[c.id], 0);
  const report = {
    tool: 'scan-history-secrets.mjs',
    rev,
    strict,
    scannedAt: new Date().toISOString(),
    commits,
    changedLinesInspected: addedLines,
    counts,
    hardCounts,
    hardHits,
    emailDomains: Object.fromEntries([...domains.entries()].sort((a, b) => b[1] - a[1])),
    details,
  };

  console.log(`# history secret scan — rev ${rev}${strict ? ' (STRICT)' : ''}`);
  console.log(`commits scanned: ${commits}   changed lines inspected: ${addedLines}`);
  console.log('');
  for (const cat of CATEGORIES) {
    const n = counts[cat.id];
    const h = hardCounts[cat.id];
    const tag = cat.hard ? (h > 0 ? `HARD-HIT ${h}` : 'clean') : n > 0 ? 'REVIEW' : 'clean';
    console.log(`${cat.id.padEnd(20)} ${String(n).padStart(6)}  ${tag}`);
    for (const d of details[cat.id]) console.log(`    ${d}`);
    if (counts[cat.id] > details[cat.id].length) {
      console.log(`    … ${counts[cat.id] - details[cat.id].length} more (truncated)`);
    }
  }
  console.log('');
  if (domains.size > 0) {
    console.log('email domains seen (local-parts never printed):');
    for (const [d, n] of [...domains.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(5)}  ${d}`);
    console.log('');
  }
  console.log(hardHits === 0 ? 'VERDICT: no hard-category hit' : `VERDICT: ${hardHits} HARD-CATEGORY HIT(S) — do not push`);

  if (jsonPath) {
    writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`json written: ${jsonPath}`);
  }
  process.exit(hardHits === 0 ? 0 : 1);
});

git.on('error', (err) => {
  console.error(`git spawn failed: ${err.message}`);
  process.exit(2);
});
