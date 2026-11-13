#!/usr/bin/env node
/**
 * Vendored schemars checksum gate — ME-13.
 *
 * apps/desktop/src-tauri/Cargo.toml patches crates-io's schemars 0.8.22 to a
 * local copy under vendor/schemars-0.8.22. A path patch has no registry
 * checksum, so nothing detects an edit to the vendored source: the "fix" for
 * tauri#14928 could be altered and the build would silently accept it.
 *
 * The manifest vendor/schemars-0.8.22.sha256 records SHA-256 for every file in
 * the crate. This gate recomputes them and fails when:
 *   - a listed file is missing or its hash differs;
 *   - a file exists in the crate that the manifest does not list (fail closed:
 *     an added file is exactly how a backdoor would arrive);
 *   - the manifest is empty;
 *   - Cargo.toml no longer patches schemars to this path, or Cargo.lock's
 *     0.8.22 entry has a registry source/checksum instead of the path patch
 *     (the manifest would then describe a crate that is not built).
 *
 * Negative control: a synthetic manifest with one wrong hash must be rejected,
 * so a checker that ignores hashes cannot pass.
 *
 * Regenerate after an intentional change:
 *   (cd apps/desktop/src-tauri/vendor && find schemars-0.8.22 -type f | sort | xargs sha256sum) \
 *     > apps/desktop/src-tauri/vendor/schemars-0.8.22.sha256
 *
 * Exit 0 only on `VENDORED SCHEMARS OK`. No dependencies.
 *
 * Usage:
 *   node tooling/security/verify-vendored-schemars.mjs
 */

import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC_TAURI = 'apps/desktop/src-tauri';
const CRATE = 'vendor/schemars-0.8.22';
const MANIFEST = 'vendor/schemars-0.8.22.sha256';

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** Parse a sha256sum manifest into Map<relativePath, hash>. */
export function parseManifest(text) {
  const map = new Map();
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const match = line.match(/^([0-9a-f]{64})\s+\*?(.+)$/);
    if (!match) throw new Error(`malformed manifest line: ${line}`);
    // The manifest is generated from `vendor/`, so entries carry the crate
    // directory prefix; compare against crate-relative paths.
    const rel = match[2].trim().replace(/^schemars-0\.8\.22\//, '');
    map.set(rel, match[1]);
  }
  return map;
}

/** Returns a list of violations for a crate dir + manifest text. */
export function checkTree(crateDir, manifestText) {
  const violations = [];
  const manifest = parseManifest(manifestText);
  if (manifest.size === 0) return ['manifest is empty'];

  const actual = new Set(
    walk(crateDir).map((file) => relative(crateDir, file).split('\\').join('/')),
  );

  for (const [rel, expected] of manifest) {
    const file = join(crateDir, rel);
    if (!existsSync(file)) {
      violations.push(`missing ${rel}`);
      continue;
    }
    const got = sha256(file);
    if (got !== expected) violations.push(`hash mismatch ${rel}`);
  }

  for (const rel of actual) {
    if (!manifest.has(rel)) violations.push(`unlisted file ${rel}`);
  }

  return violations;
}

function fail(message) {
  process.stderr.write(`VENDORED SCHEMARS FAILED — ${message}\n`);
  process.exit(1);
}

const crateDir = resolve(root, SRC_TAURI, CRATE);
const manifestPath = resolve(root, SRC_TAURI, MANIFEST);

if (!existsSync(crateDir)) fail(`${CRATE} is missing`);
if (!existsSync(manifestPath)) fail(`${MANIFEST} is missing`);

// Negative control: one wrong hash must be detected.
const firstLine = readFileSync(manifestPath, 'utf8').split('\n').find((l) => l.trim());
if (!firstLine) fail('manifest is empty');
const tampered = firstLine.replace(/^[0-9a-f]{64}/, '0'.repeat(64));
if (checkTree(crateDir, `${tampered}\n`).length === 0) {
  fail('negative control not detected: a wrong hash was accepted');
}

const violations = checkTree(crateDir, readFileSync(manifestPath, 'utf8'));
if (violations.length > 0) {
  for (const violation of violations.slice(0, 20)) process.stderr.write(`  ${violation}\n`);
  fail(`${violations.length} checksum violation(s)`);
}

// The manifest must describe the crate the build actually uses.
const cargoToml = readFileSync(resolve(root, SRC_TAURI, 'Cargo.toml'), 'utf8');
if (!/\[patch\.crates-io\][\s\S]*?schemars\s*=\s*\{\s*path\s*=\s*"vendor\/schemars-0\.8\.22"\s*\}/.test(cargoToml)) {
  fail('Cargo.toml no longer patches schemars to vendor/schemars-0.8.22');
}

const cargoLock = readFileSync(resolve(root, SRC_TAURI, 'Cargo.lock'), 'utf8');
const block = cargoLock.split('[[package]]').find((part) => /name = "schemars"/.test(part) && /version = "0\.8\.22"/.test(part));
if (!block) fail('Cargo.lock has no schemars 0.8.22 entry');
if (/source = "registry\+/.test(block)) {
  fail('Cargo.lock schemars 0.8.22 still resolves from the registry; the patch is not in effect');
}

process.stdout.write(
  `VENDORED SCHEMARS OK — ${parseManifest(readFileSync(manifestPath, 'utf8')).size} files match ` +
    `${MANIFEST}; path patch is in effect; negative control rejected\n`,
);
