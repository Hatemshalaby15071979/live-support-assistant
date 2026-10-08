#!/usr/bin/env node
/**
 * Build-identity gate (item 7, "failing test first").
 *
 * Proves the build stamp is (a) generated with the right shape, (b) exposed as a
 * version file, and (c) actually WIRED INTO THE APP — not just written to disk.
 * A stamp that is generated but never read by the UI is dead. This gate fails
 * until the app imports and renders <BuildIdentity/>, which is the whole point of
 * item 7.
 *
 *   node tooling/verify-build-identity.mjs
 *
 * Exit 0 = wired and present; 1 = a required piece is missing (the "failing test").
 * Never prints a secret.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok });
  process.stdout.write(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}\n`);
}

// 1) The application dev/build scripts must generate the version file first.
const webPackagePath = resolve(root, 'apps/web/package.json');
check('web package.json exists', existsSync(webPackagePath));
if (existsSync(webPackagePath)) {
  const scripts = JSON.parse(readFileSync(webPackagePath, 'utf8')).scripts ?? {};
  const stampCommand = 'node ../../tooling/build-stamp.mjs';
  check('dev script generates stamp before Vite', typeof scripts.dev === 'string' && scripts.dev.startsWith(`${stampCommand} &&`));
  check('build script generates stamp before TypeScript/Vite', typeof scripts.build === 'string' && scripts.build.startsWith(`${stampCommand} &&`));
}

const stampPath = resolve(root, 'apps/web/public/build-identity.json');
check('version file exists (apps/web/public/build-identity.json)', existsSync(stampPath));

let identity = null;
if (existsSync(stampPath)) {
  try { identity = JSON.parse(readFileSync(stampPath, 'utf8')); } catch { /* invalid json */ }
}
const shapeOk = !!identity
  && typeof identity.sha === 'string' && identity.sha.length >= 7 && identity.sha !== 'unknown'
  && typeof identity.shortSha === 'string' && identity.shortSha !== 'unknown'
  && typeof identity.branch === 'string' && identity.branch.length > 0 && identity.branch !== 'unknown'
  && typeof identity.builtAt === 'string' && !Number.isNaN(Date.parse(identity.builtAt))
  && typeof identity.project === 'string';
check('version file has required shape (sha, shortSha, branch, builtAt, project)', shapeOk, identity ? `branch=${identity.branch} sha=${identity.shortSha}` : 'no json');

// 2) The component exists and actually reads the version file + renders identity.
const compPath = resolve(root, 'apps/web/src/BuildIdentity.tsx');
check('BuildIdentity component exists', existsSync(compPath));
if (existsSync(compPath)) {
  const src = readFileSync(compPath, 'utf8');
  const readsFile = /\/build-identity\.json/.test(src);
  const rendersIdentity = /shortSha|branch|builtAt/.test(src);
  const exposesWindow = /window\.__BUILD_IDENTITY/.test(src);
  check('component fetches /build-identity.json', readsFile);
  check('component renders the identity (sha/branch/builtAt)', rendersIdentity);
  check('component exposes identity on window (runtime version file)', exposesWindow);
}

// 3) The app imports and RENDERS the component — the wiring that makes the stamp live.
const appPath = resolve(root, 'apps/web/src/App.tsx');
check('App.tsx exists', existsSync(appPath));
if (existsSync(appPath)) {
  const app = readFileSync(appPath, 'utf8');
  const imports = /import\s*\{?\s*BuildIdentity\s*\}?\s*from\s*['"]\.\/BuildIdentity['"]/.test(app);
  const renders = /<BuildIdentity\s*\/>/.test(app);
  check('App.tsx imports BuildIdentity', imports);
  check('App.tsx renders <BuildIdentity /> in the UI', renders);
}

const failed = checks.filter((c) => !c.ok);
process.stdout.write(`\nbuild-identity gate: ${checks.length - failed.length}/${checks.length} checks passed\n`);
if (failed.length > 0) {
  process.stdout.write('BUILD-IDENTITY GATE FAILED — the stamp is not fully wired into the app\n');
  process.exit(1);
}
process.stdout.write('BUILD-IDENTITY GATE OK — stamp generated, exposed as version file, and rendered in the UI\n');
process.exit(0);
