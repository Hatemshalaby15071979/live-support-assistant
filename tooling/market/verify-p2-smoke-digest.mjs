#!/usr/bin/env node
/**
 * Checks the deterministic smoke decision digest after the smoke rung has run.
 * Generated reports are ignored because they carry machine-local build identity.
 *
 *   node tooling/market/verify-p2-smoke-digest.mjs [--seed 20261006]
 *   node tooling/market/verify-p2-smoke-digest.mjs --negative-control
 *
 * `--negative-control` runs the real check and then proves the check can fail: it writes a
 * tampered copy of the golden digest and requires the comparison against it to be rejected.
 * A digest check that cannot fail is inert, and an inert check in the gate is worse than no
 * check at all — it reports green forever.
 *
 * Child processes are async `spawn`, never `spawnSync`/`execFileSync`. On this host
 * `spawnSync` fails EBUSY (see AGENTS.md, sandbox constraints), and the earlier version of
 * this file used `execFileSync` — which is why it crashed the moment it was first wired into
 * the gate on 2026-10-09. Nothing had ever run it.
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const seedIndex = argv.indexOf('--seed');
const seed = seedIndex >= 0 ? String(argv[seedIndex + 1]) : '20261006';
const goldenIndex = argv.indexOf('--golden');
const goldenPath = goldenIndex >= 0
  ? resolve(argv[goldenIndex + 1])
  : resolve(root, 'tooling/market/smoke-golden-digest.json');
const reportPath = resolve(root, `tooling/market/reports/smoke-${seed}.json`);
const negativeControl = argv.includes('--negative-control');

function fail(message) {
  process.stdout.write(`P2 SMOKE DIGEST FAILED — ${message}\n`);
  process.exit(1);
}

function run(command, args) {
  return new Promise((settle) => {
    const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', (error) => settle({ code: null, out, err, error: String(error) }));
    child.on('close', (code) => settle({ code, out, err, error: null }));
  });
}

async function check() {
  if (!existsSync(goldenPath)) fail('golden digest file is missing');
  if (!existsSync(reportPath)) fail('generated smoke report is missing; run the smoke rung first');

  const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  if (golden.rung !== 'smoke' || String(golden.seed) !== seed || typeof golden.decisionDigest !== 'string') {
    fail('golden digest file has an invalid shape');
  }
  if (report.digest !== golden.decisionDigest) {
    fail(`digest mismatch: expected ${golden.decisionDigest}, got ${report.digest}`);
  }

  const tracked = await run('git', ['ls-files', '--', 'tooling/market/reports']);
  if (tracked.error !== null) fail(`could not ask git which reports are tracked: ${tracked.error}`);
  const trackedReports = tracked.out.trim();
  if (trackedReports !== '') fail(`generated report is tracked: ${trackedReports.split(/\r?\n/).join(', ')}`);
}

async function negativeControlCheck() {
  // Spawned as a child so the control cannot share a code path with the real check that might
  // mask a failure. The tampered copy keeps rung and seed, so it passes the shape check and
  // reaches the digest comparison — the control tests the comparison, not the parser.
  const tamperedPath = join(tmpdir(), `smoke-golden-tampered-${process.pid}.json`);
  const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
  writeFileSync(tamperedPath, JSON.stringify({ ...golden, decisionDigest: '0'.repeat(64) }, null, 2));

  const child = await run(process.execPath, [
    fileURLToPath(import.meta.url),
    '--seed', seed,
    '--golden', tamperedPath,
  ]);

  if (child.code === 0) {
    process.stdout.write('  FAIL  negative control — a tampered golden digest was accepted\n');
    process.stdout.write('P2 SMOKE DIGEST FAILED — the digest check cannot fail, so it proves nothing\n');
    process.exit(1);
  }
  process.stdout.write(`  pass  negative control — a tampered golden digest is rejected (exit ${child.code})\n`);
}

await check();
if (negativeControl) await negativeControlCheck();

process.stdout.write(
  `P2 SMOKE DIGEST OK — smoke-${seed} matches the golden decision digest; generated reports are untracked` +
    `${negativeControl ? '; negative control live' : ''}\n`,
);
