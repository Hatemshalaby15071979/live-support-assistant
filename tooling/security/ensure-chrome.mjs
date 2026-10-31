#!/usr/bin/env node
/**
 * Bootstrap a pinned chrome-headless-shell for the XSS harness.
 *
 * Downloads once into .cache/chrome (gitignored), verifies the binary exists, and
 * prints its path. Offline machines get a clear instruction instead of a harness
 * that cannot run.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CACHE_DIR, PINNED_VERSION, resolveChrome } from './chrome.mjs';

const platform = process.platform === 'linux' && process.arch === 'x64' ? 'linux64' : null;
const URL = platform
  ? `https://storage.googleapis.com/chrome-for-testing-public/${PINNED_VERSION}/${platform}/chrome-headless-shell-${platform}.zip`
  : null;

function fail(message) {
  process.stderr.write(`ensure-chrome: ${message}\n`);
  process.exit(1);
}

export function ensureChrome() {
  const existing = resolveChrome();
  if (existing) return existing;
  if (!URL) {
    fail(`no Chrome found and no pinned download for ${process.platform}/${process.arch}; set CHROME_PATH`);
  }
  const target = resolve(CACHE_DIR, PINNED_VERSION);
  const binary = resolve(target, `chrome-headless-shell-${platform}`, 'chrome-headless-shell');
  if (existsSync(binary)) return binary;

  mkdirSync(CACHE_DIR, { recursive: true });
  const archive = resolve(CACHE_DIR, `chrome-headless-shell-${PINNED_VERSION}.zip`);
  const curl = spawnSync('curl', ['-fsSL', '--retry', '3', '-o', archive, URL], { stdio: 'inherit' });
  if (curl.status !== 0) fail('download failed; set CHROME_PATH to a local Chrome');
  const unzip = spawnSync('unzip', ['-q', '-o', archive, '-d', target], { stdio: 'inherit' });
  if (unzip.status !== 0) fail('unzip failed; install unzip or set CHROME_PATH');
  rmSync(archive, { force: true });
  if (!existsSync(binary)) fail(`archive did not contain ${binary}`);
  return binary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${ensureChrome()}\n`);
}
