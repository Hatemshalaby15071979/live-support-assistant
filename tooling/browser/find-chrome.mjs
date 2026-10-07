/**
 * Locate a Chrome or Chromium binary.
 *
 * Five drivers in this repository need one, and before this module each carried
 * its own candidate list. Four were Windows-only and they did not agree with each
 * other: `tooling/video/capture-demo.mjs` checked two Program Files paths and
 * threw, while the evaluation drivers also checked `%LOCALAPPDATA%`. The result
 * was a documented portability gap (`docs/KNOWN_ISSUES.md` §8) that depended on
 * which driver you happened to run.
 *
 * One resolver, five call sites. The interface is deliberately two functions:
 * `findChrome` returns a path or null, `requireChrome` returns a path or throws
 * with a message naming what was tried. Everything else — the platform table, the
 * PATH walk, the environment override — is implementation.
 *
 * `SOP_CHROME_PATH` (or the conventional `CHROME_PATH`) wins when set, so a host
 * with an unusual install is a one-variable fix rather than a code change.
 */

import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

/** Environment variables checked first, in order. */
const OVERRIDE_VARS = ['SOP_CHROME_PATH', 'CHROME_PATH'];

/** Well-known absolute paths per platform. */
const PLATFORM_CANDIDATES = {
  win32: (env) => [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
    `${env.PROGRAMFILES ?? ''}\\Microsoft\\Edge\\Application\\msedge.exe`,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: () => [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: () => [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/microsoft-edge',
  ],
};

/** Bare names to look for on PATH. */
const PATH_NAMES = [
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
  'chrome',
  'msedge',
];

function fromPath(env) {
  const entries = (env.PATH ?? '').split(delimiter).filter((entry) => entry !== '');
  const suffixes = process.platform === 'win32' ? ['.exe', ''] : [''];

  for (const name of PATH_NAMES) {
    for (const suffix of suffixes) {
      for (const entry of entries) {
        const candidate = join(entry, `${name}${suffix}`);
        if (existsSync(candidate)) return candidate;
      }
    }
  }

  return null;
}

function candidates(env) {
  const table = PLATFORM_CANDIDATES[process.platform];
  return table === undefined ? [] : table(env);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null} Path to a browser binary, or null when none was found.
 */
export function findChrome(env = process.env) {
  for (const name of OVERRIDE_VARS) {
    const value = env[name];
    if (typeof value === 'string' && value !== '' && existsSync(value)) {
      return value;
    }
  }

  for (const candidate of candidates(env)) {
    if (candidate !== '' && existsSync(candidate)) return candidate;
  }

  return fromPath(env);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string} Path to a browser binary.
 * @throws When none is found, naming every location that was tried.
 */
export function requireChrome(env = process.env) {
  const found = findChrome(env);
  if (found !== null) return found;

  const tried = [...OVERRIDE_VARS, ...candidates(env), `PATH: ${PATH_NAMES.join(', ')}`];
  throw new Error(
    `No Chrome or Chromium binary found. Set SOP_CHROME_PATH to one, or install it. ` +
      `Tried: ${tried.filter((entry) => entry !== '').join(' | ')}`,
  );
}
