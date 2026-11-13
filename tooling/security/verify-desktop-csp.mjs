#!/usr/bin/env node
/**
 * Desktop CSP gate — HI-03.
 *
 * The Tauri shell shipped `app.security.csp: null`, which disables the WebView's
 * Content-Security-Policy entirely. Every other XSS control in this repository
 * (the textContent render path, the stand-in harness, the real-client harness)
 * assumes the browser is allowed to refuse inline script. With `csp: null` it is
 * not: a single HTML-injection sink anywhere in the dependency tree becomes
 * executable script in the desktop build.
 *
 * This gate fails when:
 *   - `app.security.csp` is missing, null, empty, or not a string;
 *   - the policy lacks `default-src` or `script-src`;
 *   - `script-src` allows inline or eval (`'unsafe-inline'`, `'unsafe-eval'`),
 *     a wildcard, or a data:/blob: source;
 *   - `object-src 'none'`, `base-uri`, or `frame-ancestors` is missing;
 *   - the policy contains a directive that is only whitespace.
 *
 * It also runs a negative control against an in-memory copy of the config: the
 * checker must reject `csp: null` and a policy with `script-src 'unsafe-inline'`.
 * A checker that cannot reject the original defect would pass vacuously.
 *
 * Exit 0 only on `DESKTOP CSP OK`; exit 1 on any violation. No dependencies.
 *
 * Usage:
 *   node tooling/security/verify-desktop-csp.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CONFIG = 'apps/desktop/src-tauri/tauri.conf.json';

function directives(csp) {
  const map = new Map();
  for (const part of csp.split(';')) {
    const trimmed = part.trim();
    if (trimmed === '') continue;
    const [name, ...values] = trimmed.split(/\s+/);
    map.set(name.toLowerCase(), values);
  }
  return map;
}

/** Returns a list of violations; empty means the policy is acceptable. */
export function checkCsp(config) {
  const violations = [];
  const csp = config?.app?.security?.csp;

  if (typeof csp !== 'string' || csp.trim() === '') {
    violations.push(
      `app.security.csp is ${csp === null ? 'null' : JSON.stringify(csp)}; a strict policy is required`,
    );
    return violations;
  }

  const d = directives(csp);
  for (const required of ['default-src', 'script-src']) {
    if (!d.has(required)) violations.push(`missing ${required}`);
  }
  if (!d.has('object-src') || d.get('object-src').join(' ') !== "'none'") {
    violations.push("object-src must be 'none'");
  }
  if (!d.has('base-uri')) violations.push('missing base-uri');
  if (!d.has('frame-ancestors')) violations.push('missing frame-ancestors');

  const script = d.get('script-src') ?? [];
  for (const banned of ["'unsafe-inline'", "'unsafe-eval'", '*', 'data:', 'blob:', 'http:', 'https:']) {
    if (script.includes(banned)) {
      violations.push(`script-src must not allow ${banned}`);
    }
  }
  if (script.length === 0) violations.push('script-src is empty');

  for (const [name, values] of d) {
    if (values.length === 0 && name !== 'upgrade-insecure-requests') {
      violations.push(`directive ${name} has no sources`);
    }
  }

  return violations;
}

function fail(message) {
  process.stderr.write(`DESKTOP CSP FAILED — ${message}\n`);
  process.exit(1);
}

const raw = readFileSync(resolve(root, CONFIG), 'utf8');
let config;
try {
  config = JSON.parse(raw);
} catch (error) {
  fail(`${CONFIG} is not valid JSON: ${error.message}`);
}

const violations = checkCsp(config);
if (violations.length > 0) {
  fail(violations.join('; '));
}

// Negative controls: the checker must reject the exact defect this gate exists
// for, and the most common way a "strict" policy is quietly weakened.
const controls = [
  {
    label: 'csp: null',
    config: { app: { security: { csp: null } } },
  },
  {
    label: "script-src 'unsafe-inline'",
    config: {
      app: {
        security: {
          csp:
            "default-src 'self'; script-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
        },
      },
    },
  },
  {
    label: 'missing object-src',
    config: {
      app: {
        security: {
          csp: "default-src 'self'; script-src 'self'; base-uri 'self'; frame-ancestors 'none'",
        },
      },
    },
  },
];

for (const control of controls) {
  if (checkCsp(control.config).length === 0) {
    fail(`negative control not rejected: ${control.label}`);
  }
}

process.stdout.write(
  `DESKTOP CSP OK — strict policy on ${CONFIG} (script-src 'self', object-src 'none'); ` +
    `${controls.length} negative controls rejected\n`,
);
