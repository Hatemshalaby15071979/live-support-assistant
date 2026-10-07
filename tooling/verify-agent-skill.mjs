#!/usr/bin/env node
// tooling/verify-agent-skill.mjs
//
// Enforcement gate for the Hatem_specific agent skill.
//
// Fails (process.exit(1)) unless ALL of these hold:
//   1. Hatem_specific.md exists at the repo root with YAML frontmatter that
//      defines both `name` and `description`.
//   2. The constitution rule IDs C1..C28 and F1..F5 are all present in the file.
//   3. AGENTS.md references Hatem_specific.md (the wiring line is in place).
//
// Includes a negative control: a temp copy with one rule ID removed must make
// the check fail. If it does not, the verifier itself is broken and we exit 1.
//
// Run: `node tooling/verify-agent-skill.mjs`

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_FILE = join(ROOT, 'Hatem_specific.md');
const AGENTS_FILE = join(ROOT, 'AGENTS.md');

const RULE_IDS = [
  ...Array.from({ length: 28 }, (_, i) => 'C' + (i + 1)),
  ...Array.from({ length: 5 }, (_, i) => 'F' + (i + 1)),
];

function fail(reason, failures) {
  failures.push(reason);
}

// Checks frontmatter + rule presence for a given skill file path.
// Returns the list of failure strings (empty == passed).
function verifySkillFile(path) {
  const failures = [];
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    fail(`Hatem_specific.md missing at ${path}`, failures);
    return failures;
  }

  const fm = parseFrontmatter(raw);
  if (!fm) {
    fail('Hatem_specific.md has no valid YAML frontmatter block', failures);
  } else {
    if (!fm.name || String(fm.name).trim() === '') fail('frontmatter missing "name"', failures);
    if (!fm.description || String(fm.description).trim() === '')
      fail('frontmatter missing "description"', failures);
  }

  for (const id of RULE_IDS) {
    if (!hasRuleId(raw, id)) fail(`rule id ${id} not found in Hatem_specific.md`, failures);
  }
  return failures;
}

function parseFrontmatter(text) {
  // Normalise line endings first. Without this the parser is CRLF-sensitive and
  // the verifier fails on every Windows checkout, where `core.autocrlf=true` is
  // the Git for Windows default: `(.*)$` below cannot match a line ending in
  // `\r`, because `.` excludes line terminators and `$` (without /m) matches only
  // the end of input. Every property silently failed to parse and the verifier
  // reported `frontmatter missing "name"` on a file that plainly has one.
  //
  // Found in live-support-assistant on 2026-10-07, where the file was written LF
  // and checked out CRLF. The same defect is present in Helix-Prime, where the
  // file happened to stay LF so it never fired.
  const normalised = text.replace(/\r\n/g, '\n');
  if (!normalised.startsWith('---')) return null;
  const end = normalised.indexOf('\n---', 3);
  if (end === -1) return null;
  const block = normalised.slice(3, end).trim();
  const obj = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s?(.*)$/);
    if (m) obj[m[1]] = m[2].trim();
  }
  return obj;
}

// A rule id is present when it appears as a standalone token: preceded by a
// non-word char (or start) and followed by a word boundary, '.', space or EOL.
// The word-boundary lookahead stops "C1" from matching inside "C14".
function hasRuleId(text, id) {
  return new RegExp(`(?:^|[^A-Za-z0-9])${id}(?=\\b|\\.|\\s|$)`, 'u').test(text);
}

const failures = [];

// 1 + 2: skill file frontmatter and rule ids.
for (const f of verifySkillFile(SKILL_FILE)) fail(f, failures);

// 3: AGENTS.md must reference the skill file.
try {
  const agents = readFileSync(AGENTS_FILE, 'utf8');
  if (!/Hatem_specific\.md/i.test(agents)) {
    fail('AGENTS.md does not reference Hatem_specific.md (wiring line missing)', failures);
  }
} catch {
  fail(`AGENTS.md missing at ${AGENTS_FILE}`, failures);
}

// Negative control: removing one rule id from a temp copy MUST make the check fail.
if (failures.length === 0) {
  const raw = readFileSync(SKILL_FILE, 'utf8');
  const tmpDir = mkdtempSync(join(tmpdir(), 'verify-agent-skill-'));
  const crippledPath = join(tmpDir, 'Hatem_specific.md');
  // Strip every occurrence of C7 so the id is genuinely absent.
  writeFileSync(crippledPath, raw.replaceAll('C7', 'ZZ7'));
  const ctrl = verifySkillFile(crippledPath);
  if (ctrl.length === 0) {
    fail(
      'NEGATIVE CONTROL BROKEN: verifier passed even after rule C7 was removed — the check is not enforcing rule presence',
      failures,
    );
  } else {
    console.log('[verify-agent-skill] negative control OK: crippled copy failed as expected.');
  }
}

// Second control: the same file with CRLF line endings must still parse.
//
// This is not hypothetical. The verifier failed on this repository's Windows
// checkout because `(.*)$` in the frontmatter parser cannot match a line ending
// in `\r`, so every property silently failed to parse and a file with a valid
// `name` was reported as having none. A gate that fails on the platform it runs
// on is not a gate. The control converts the real file to CRLF and requires the
// same verdict.
if (failures.length === 0) {
  const raw = readFileSync(SKILL_FILE, 'utf8');
  const tmpDir = mkdtempSync(join(tmpdir(), 'verify-agent-skill-crlf-'));
  const crlfPath = join(tmpDir, 'Hatem_specific.md');
  writeFileSync(crlfPath, raw.replace(/\r?\n/g, '\r\n'));
  const ctrl = verifySkillFile(crlfPath);
  if (ctrl.length !== 0) {
    fail(
      `CRLF CONTROL BROKEN: the verifier rejects the same file with CRLF line endings (${ctrl.join('; ')}) — ` +
        'it would fail on any Windows checkout, where core.autocrlf=true is the default',
      failures,
    );
  } else {
    console.log('[verify-agent-skill] CRLF control OK: the same file parses with CRLF line endings.');
  }
}

if (failures.length > 0) {
  console.error('[verify-agent-skill] FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}

console.log(
  '[verify-agent-skill] OK: Hatem_specific.md present, frontmatter valid, C1-C28 + F1-F5 present, AGENTS.md wired.',
);
process.exit(0);
