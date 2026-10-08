#!/usr/bin/env node
/**
 * P2 smoke runner (V2 §P2) — CI entrypoint.
 *
 * Runs the Market Twin smoke rung with a pinned seed and fails the CI step if the
 * smoke invariants do not hold. It reuses tooling/market/run-market.mjs — the
 * single source of truth for the smoke rung — rather than duplicating its
 * orchestration. The smoke rung proves the traffic generator, the chaos events,
 * the invariant assertions and the report are deterministic and correctly wired;
 * it does NOT measure retrieval (no embedder, no corpus, no gold set in scope).
 *
 *   node tooling/market/p2-smoke-runner.mjs [--seed 20261006]
 *
 * Exits 0 only when run-market.mjs itself exits 0 (every smoke invariant holds).
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const runMarket = resolve(ROOT, 'tooling/market/run-market.mjs');
const verifyDigest = resolve(ROOT, 'tooling/market/verify-p2-smoke-digest.mjs');

const argv = process.argv.slice(2);
const seedIdx = argv.indexOf('--seed');
const seed = seedIdx >= 0 && argv[seedIdx + 1] ? argv[seedIdx + 1] : '20261006';

const result = spawnSync(process.execPath, [runMarket, '--seed', String(seed), '--rung', 'smoke'], {
  cwd: ROOT,
  stdio: 'inherit',
  timeout: 120000,
});

if (result.error) {
  process.stdout.write(`P2 smoke: could not start runner — ${result.error.message}\n`);
  process.exit(2);
}
if (result.status !== 0) process.exit(result.status ?? 1);

const digest = spawnSync(process.execPath, [verifyDigest, '--seed', String(seed)], {
  cwd: ROOT,
  stdio: 'inherit',
  timeout: 30000,
});
if (digest.error) {
  process.stdout.write(`P2 smoke: could not verify the golden digest — ${digest.error.message}\n`);
  process.exit(2);
}
process.exit(digest.status ?? 1);
