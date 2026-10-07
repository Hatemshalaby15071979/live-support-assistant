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
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const block = text.slice(3, end).trim();
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

if (failures.length > 0) {
  console.error('[verify-agent-skill] FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}

console.log(
  '[verify-agent-skill] OK: Hatem_specific.md present, frontmatter valid, C1-C28 + F1-F5 present, AGENTS.md wired.',
);
process.exit(0);
