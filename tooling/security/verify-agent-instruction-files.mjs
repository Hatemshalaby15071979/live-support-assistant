#!/usr/bin/env node
/**
 * Agent-text quarantine guard — ME-15.
 *
 * This repository contains files written as directives to coding agents:
 * AGENTS.md, Hatem_specific.md, the constitutions, a production-readiness
 * prompt, and an agent self-test. An agent that treats them as trusted
 * instructions inherits whatever they say, including claims that are stale or
 * wrong. They are data for a human to read, not a control channel.
 *
 * Every such file must open with the marker `UNTRUSTED AGENT TEXT (ME-15)`
 * (after YAML frontmatter, where present). A new file whose name matches the
 * agent-directed patterns must be added to KNOWN and carry the header — the
 * guard fails on an unlisted match so a prompt file cannot arrive unnoticed.
 *
 * Negative controls: a synthetic unlisted `*_PROMPT.md` path must be flagged,
 * and a listed file without the header must be flagged. A guard that cannot
 * detect either would pass vacuously.
 *
 * Do not delete these files without owner approval (the finding says so); this
 * guard only quarantines them.
 *
 * Exit 0 only on `AGENT TEXT QUARANTINE OK`. No dependencies.
 *
 * Usage:
 *   node tooling/security/verify-agent-instruction-files.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MARKER = 'UNTRUSTED AGENT TEXT (ME-15)';

export const KNOWN = [
  '00_CONSTITUTION.md',
  'AGENTS.md',
  'Hatem_specific.md',
  'docs/PRODUCTION_READINESS_EXECUTION_PROMPT.md',
  'docs/program/agent-self-test.md',
];

const PATTERN = /(^|\/)(AGENTS\.md|Hatem_specific\.md|[^/]*CONSTITUTION[^/]*\.md|[^/]*_PROMPT\.md|agent-self-test\.md)$/i;

/** Returns a list of violations for a list of tracked paths + a reader. */
export function check(paths, read) {
  const violations = [];
  const known = new Set(KNOWN);

  for (const path of paths) {
    if (!PATTERN.test(path)) continue;
    if (!known.has(path)) {
      violations.push(`new agent-directed file not quarantined: ${path}`);
    }
  }

  for (const path of KNOWN) {
    if (!existsSync(resolve(root, path))) {
      violations.push(`listed file is missing: ${path}`);
      continue;
    }
    if (!read(path).includes(MARKER)) {
      violations.push(`missing "${MARKER}" header: ${path}`);
    }
  }

  return violations;
}

function fail(message) {
  process.stderr.write(`AGENT TEXT QUARANTINE FAILED — ${message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------- controls ---
const stub = () => '';
const synthetic = check(['docs/NEW_AGENT_PROMPT.md'], stub);
if (synthetic.length === 0) {
  fail('negative control not detected: an unlisted *_PROMPT.md was accepted');
}
const missingHeader = check(KNOWN, stub);
if (missingHeader.length !== KNOWN.length) {
  fail('negative control not detected: a file without the header was accepted');
}

// ------------------------------------------------------------------- scan ---
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

const read = (path) => readFileSync(resolve(root, path), 'utf8');
const violations = check(tracked, read);
if (violations.length > 0) {
  for (const violation of violations) process.stderr.write(`  ${violation}\n`);
  fail(`${violations.length} quarantine violation(s)`);
}

process.stdout.write(
  `AGENT TEXT QUARANTINE OK — ${KNOWN.length} files carry the "${MARKER}" header; ` +
    'unlisted *_PROMPT.md and header-less files are rejected\n',
);
