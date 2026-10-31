/**
 * Resolve a usable headless Chrome for the XSS harness.
 *
 * The harness used to hardcode one Windows path, so a Linux or CI run reported
 * "NOT RUN" and the gate counted the suite as failed. Resolution is now a
 * candidate list plus the locally bootstrapped headless shell.
 *
 * Snap Chromium is deliberately not a candidate: on this host it fails with
 * "cannot create transient scope: DBus error", which would turn a missing browser
 * into a confusing harness failure rather than an instruction.
 */
import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export const PINNED_VERSION = '156.0.8078.80';
export const CACHE_DIR = resolve(root, '.cache/chrome');

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean);

function cachedHeadlessShell() {
  if (!existsSync(CACHE_DIR)) return null;
  for (const entry of readdirSync(CACHE_DIR)) {
    const binary = resolve(CACHE_DIR, entry, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
    if (existsSync(binary)) return binary;
  }
  return null;
}

export function resolveChrome() {
  for (const candidate of CANDIDATES) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return cachedHeadlessShell();
}
