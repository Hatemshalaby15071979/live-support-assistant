#!/usr/bin/env node
/**
 * Negative controls for the dependency gate.
 *
 * A gate that only ever passes is indistinguishable from no gate, and the
 * failure mode is specific: `tooling/audit-gate.mjs` fails a build on something
 * new or worse, so its two dangerous states are (a) passing when it should fail,
 * and (b) failing when it should pass. Neither is visible from a green run on a
 * clean tree, which is the only state anyone ever observes it in.
 *
 * So this harness injects synthetic audit reports against synthetic baselines and
 * asserts the exit code the gate must produce. It runs the gate as a child
 * process, because the exit code *is* the interface — calling into the module
 * would test a different thing.
 *
 * The gate's own paths are overridden through `SOP_AUDIT_JSON` and
 * `SOP_AUDIT_BASELINE`, so the committed baseline is never touched. CI does not
 * set those variables, so this harness cannot weaken the published gate.
 *
 * Run after `pnpm build` (it needs nothing else):
 *     node tooling/verify-audit-gate.mjs
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gate = resolve(root, 'tooling/audit-gate.mjs');

const scratch = mkdtempSync(join(tmpdir(), 'sop-audit-gate-'));

const checks = [];

function record(name, expected, observed, ok) {
  checks.push({ name, expected: String(expected), observed: String(observed), ok });
}

/** One advisory in the shape pnpm audit emits. */
function advisory(id, severity, module = 'example-package') {
  return {
    [id]: {
      github_advisory_id: id,
      id: 1,
      severity,
      module_name: module,
      title: `synthetic ${id}`,
      url: 'https://example.invalid',
    },
  };
}

function auditReport(advisories) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  for (const entry of Object.values(advisories)) counts[entry.severity] += 1;
  return JSON.stringify({ advisories, metadata: { vulnerabilities: counts } });
}

/**
 * Run the gate against a synthetic pair and return its exit code.
 *
 * @param {{audit?: string, baseline?: unknown, label: string}} options
 *   `audit` is the raw text handed to the gate; `baseline` is written as JSON, or
 *   omitted entirely when `undefined` so the missing-file path is exercised.
 */
function runGate({ audit = '{}', baseline, label }) {
  const auditPath = join(scratch, `${label}.audit.json`);
  const baselinePath = join(scratch, `${label}.baseline.json`);

  writeFileSync(auditPath, audit, 'utf8');
  if (baseline !== undefined) {
    writeFileSync(
      baselinePath,
      typeof baseline === 'string' ? baseline : `${JSON.stringify(baseline, null, 2)}\n`,
      'utf8',
    );
  }

  const env = {
    ...process.env,
    SOP_AUDIT_JSON: auditPath,
    SOP_AUDIT_BASELINE: baselinePath,
  };
  // The gate is spawned through node directly rather than through a shell, so the
  // harness does not depend on how pnpm resolves on this host.
  delete env.NODE_OPTIONS;

  return new Promise((settle) => {
    const child = spawn(process.execPath, [gate], {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { out += chunk; });
    let err = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { err += chunk; });

    child.on('error', (error) => settle({ code: -1, out: String(error), err: '' }));
    child.on('close', (code) => settle({ code, out, err }));
  });
}

const clean = auditReport({});
const oneHigh = auditReport(advisory('GHSA-test-0001', 'high'));

// ---------------------------------------------------------------------------
// The two states that matter most, and they are opposites.
// ---------------------------------------------------------------------------

// 1. An empty baseline on a clean tree must still pass. This is the state the
//    repository is actually in since the advisory set reached zero, and a gate
//    that fails here would be turned off within a day.
{
  const result = await runGate({
    audit: clean,
    baseline: { note: 'empty by design', advisories: {} },
    label: 'pass-empty',
  });
  record('empty baseline + clean audit passes', 0, result.code, result.code === 0);
}

// 2. The negative control: an advisory that is not in the baseline must fail.
//    Without this the harness would pass on a gate that never fails at all.
{
  const result = await runGate({
    audit: oneHigh,
    baseline: { note: 'empty by design', advisories: {} },
    label: 'fail-new',
  });
  record('injected advisory fails the gate', 1, result.code, result.code === 1);
  record(
    'the failure names the injected advisory',
    true,
    result.out.includes('GHSA-test-0001'),
    result.out.includes('GHSA-test-0001'),
  );
}

// ---------------------------------------------------------------------------
// Tolerance, and its limits.
// ---------------------------------------------------------------------------

// 3. An advisory already tolerated at the same severity must pass, or the
//    baseline does nothing.
{
  const result = await runGate({
    audit: oneHigh,
    baseline: { note: '', advisories: { 'GHSA-test-0001': 'high' } },
    label: 'pass-baselined',
  });
  record('a baselined advisory passes at the same severity', 0, result.code, result.code === 0);
}

// 4. The same advisory getting worse must fail — this is the "escalated" half of
//    the gate, and it is easy to lose when only new ids are compared.
{
  const result = await runGate({
    audit: auditReport(advisory('GHSA-test-0001', 'critical')),
    baseline: { note: '', advisories: { 'GHSA-test-0001': 'moderate' } },
    label: 'fail-escalated',
  });
  record('an escalated severity fails the gate', 1, result.code, result.code === 1);
}

// 5. The converse must NOT fail. An advisory that gets better is an improvement,
//    and a gate that red-builds on an improvement trains people to edit it.
{
  const result = await runGate({
    audit: auditReport(advisory('GHSA-test-0001', 'low')),
    baseline: { note: '', advisories: { 'GHSA-test-0001': 'high' } },
    label: 'pass-downgrade',
  });
  record('a de-escalated severity passes', 0, result.code, result.code === 0);
}

// 6. An advisory that disappears entirely must pass. The baseline is allowed to
//    go stale; it is a tolerance list, not a contract.
{
  const result = await runGate({
    audit: clean,
    baseline: { note: '', advisories: { 'GHSA-test-0001': 'high' } },
    label: 'pass-resolved',
  });
  record('a resolved advisory passes', 0, result.code, result.code === 0);
}

// ---------------------------------------------------------------------------
// Refusing to read is not the same as reading clean.
// ---------------------------------------------------------------------------

// 7. An unreadable audit must exit 2, never 0. The gate already documents this
//    ("refusing to treat an unreadable audit as a clean one"); this pins it.
{
  const result = await runGate({
    audit: 'not json at all',
    baseline: { note: '', advisories: {} },
    label: 'fail-unreadable',
  });
  record('an unreadable audit report exits 2', 2, result.code, result.code === 2);
}

// 8. A missing baseline must exit 2 rather than silently tolerating nothing.
{
  const result = await runGate({
    audit: clean,
    baseline: undefined,
    label: 'fail-no-baseline',
  });
  record('a missing baseline exits 2', 2, result.code, result.code === 2);
}

// 9. The gate must not be talkable-out-of by a malformed baseline. A file whose
//    JSON parses but whose `advisories` is not an object should not crash into a
//    pass; it must fail closed.
{
  const result = await runGate({
    audit: oneHigh,
    baseline: '{"note":"no advisories key at all"}',
    label: 'fail-shape',
  });
  record('a baseline with no advisories key still fails on a new advisory', 1, result.code, result.code === 1);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

rmSync(scratch, { recursive: true, force: true });

const width = {
  name: Math.max(...checks.map((check) => check.name.length), 5),
  expected: Math.max(...checks.map((check) => check.expected.length), 8),
};

console.log('');
console.log(
  `${'CHECK'.padEnd(width.name)}  ${'EXPECTED'.padEnd(width.expected)}  ${'OBSERVED'.padEnd(width.expected)}  RESULT`,
);
console.log('-'.repeat(width.name + width.expected * 2 + 16));

for (const check of checks) {
  console.log(
    `${check.name.padEnd(width.name)}  ${check.expected.padEnd(width.expected)}  ${check.observed.padEnd(width.expected)}  ${check.ok ? 'PASS' : 'FAIL'}`,
  );
}

const failures = checks.filter((check) => !check.ok).length;

console.log('');
console.log(`checks: ${checks.length}  failures: ${failures}`);
console.log('');
console.log(failures === 0 ? 'AUDIT GATE VERIFICATION OK' : 'AUDIT GATE VERIFICATION FAILED');

process.exit(failures === 0 ? 0 : 1);
