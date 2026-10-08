#!/usr/bin/env node
/**
 * Checks the deterministic smoke decision digest after p2-smoke-runner has run.
 * Generated reports are ignored because they carry machine-local build identity.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const seedIndex = process.argv.indexOf('--seed');
const seed = seedIndex >= 0 ? String(process.argv[seedIndex + 1]) : '20261006';
const goldenPath = resolve(root, 'tooling/market/smoke-golden-digest.json');
const reportPath = resolve(root, `tooling/market/reports/smoke-${seed}.json`);

function fail(message) {
  process.stdout.write(`P2 SMOKE DIGEST FAILED — ${message}\n`);
  process.exit(1);
}

if (!existsSync(goldenPath)) fail('golden digest file is missing');
if (!existsSync(reportPath)) fail('generated smoke report is missing; run p2-smoke-runner first');

const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
if (golden.rung !== 'smoke' || String(golden.seed) !== seed || typeof golden.decisionDigest !== 'string') {
  fail('golden digest file has an invalid shape');
}
if (report.digest !== golden.decisionDigest) {
  fail(`digest mismatch: expected ${golden.decisionDigest}, got ${report.digest}`);
}

const trackedReports = execFileSync('git', ['ls-files', '--', 'tooling/market/reports'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
if (trackedReports !== '') fail(`generated report is tracked: ${trackedReports.split(/\r?\n/).join(', ')}`);

process.stdout.write(`P2 SMOKE DIGEST OK — smoke-${seed} matches the golden decision digest; generated reports are untracked\n`);
