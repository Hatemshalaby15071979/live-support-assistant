#!/usr/bin/env node
/**
 * Configuration must not carry a real Supabase project ref — HI-05.
 *
 * `.env.example` shipped the development project's real URL
 * (`https://<20-char-ref>.supabase.co`) while SHIPMENT_READINESS claimed the
 * file held "placeholder/localhost values only". The ref is not a secret, but
 * the false claim was, and a real ref in the example file invites operators to
 * point a build at somebody else's project.
 *
 * Scope is deliberately narrow: the files an operator copies or a workflow
 * reads — `.env*`, `.github/workflows/*`, `supabase/config.toml`. Historical
 * evidence under `docs/` and `tooling/eval/simulated-tenant/` records the
 * development project it ran against and is not configuration; rewriting that
 * history would falsify the evidence. SHIPMENT_READINESS states this split.
 *
 * Placeholder refs allowed: your-project-ref, project-ref, example, localhost,
 * 127.0.0.1, and any ref containing `<` or `>`.
 *
 * Negative control: the detector must flag a synthetic 20-character ref and
 * must NOT flag the placeholder. A detector that cannot tell them apart would
 * pass vacuously.
 *
 * Exit 0 only on `NO REAL PROJECT REFS OK`; exit 1 on any hit. No dependencies.
 *
 * Usage:
 *   node tooling/security/verify-no-real-project-refs.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SELF = 'tooling/security/verify-no-real-project-refs.mjs';

// Supabase project refs are 20 lowercase alphanumeric characters.
const URL_RE = /https:\/\/([a-z0-9]{20})\.supabase\.co/g;
const REF_RE = /\bSUPABASE_PROJECT_REF\s*=\s*["']?([a-z0-9]{20})\b/g;

const ALLOWED = new Set([
  'your-project-ref',
  'project-ref',
  'example',
  'localhost',
  '127.0.0.1',
]);

export function isPlaceholder(ref) {
  return ALLOWED.has(ref) || ref.includes('<') || ref.includes('>');
}

/** Returns [{ file, line, match }] for real-looking refs in `text`. */
export function findRealRefs(text, file = '<input>') {
  const hits = [];
  for (const [re, kind] of [
    [URL_RE, 'url'],
    [REF_RE, 'project_ref'],
  ]) {
    for (const match of text.matchAll(re)) {
      const ref = match[1];
      if (isPlaceholder(ref)) continue;
      hits.push({ file, kind, ref, line: match.index ?? 0 });
    }
  }
  return hits;
}

function inScope(file) {
  if (file === SELF) return false;
  const base = file.split('/').pop();
  return (
    base.startsWith('.env') ||
    file.startsWith('.github/workflows/') ||
    file === 'supabase/config.toml'
  );
}

function fail(message) {
  process.stderr.write(`NO REAL PROJECT REFS FAILED — ${message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------- controls ---
const synthetic = 'SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co\n';
if (findRealRefs(synthetic).length !== 1) {
  fail('negative control not detected: a 20-character project ref was accepted');
}
const placeholder = 'SUPABASE_URL=https://your-project-ref.supabase.co\n';
if (findRealRefs(placeholder).length !== 0) {
  fail('positive control rejected: the documented placeholder was flagged');
}

// ------------------------------------------------------------------- scan ---
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter(inScope);

const hits = [];
for (const file of tracked) {
  const text = readFileSync(resolve(root, file), 'utf8');
  hits.push(...findRealRefs(text, file));
}

if (hits.length > 0) {
  for (const hit of hits) {
    process.stderr.write(`  ${hit.file}: real project ref ${hit.kind} ${hit.ref}\n`);
  }
  fail(`${hits.length} real project ref(s) in configuration`);
}

process.stdout.write(
  `NO REAL PROJECT REFS OK — ${tracked.length} configuration file(s) scanned; ` +
    'negative control (20-char ref) detected, placeholder accepted\n',
);
