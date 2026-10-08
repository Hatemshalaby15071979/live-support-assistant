#!/usr/bin/env node
/**
 * XSS harness (V2 security gate).
 *
 * Submits a battery of XSS payloads through the app's authoring path (the
 * upsert-sop edge function, the same endpoint a tenant editor uses) and asserts
 * that the stored/echoed value is NOT executable markup. This catches the
 * server-side storing of raw, active markup, which would become stored XSS if
 * the client ever rendered it without escaping.
 *
 * AUTHORITATIVE NOTE: the real XSS defence is client-side escaping on render.
 * This harness is a backstop: it fails the run if the API returns a value that
 * still contains an unescaped active tag/event-handler. A pass here does not
 * replace a browser-side review; it proves the stored value is not raw-executable.
 *
 * Usage:
 *   node tooling/security/xss-harness.mjs
 *
 * Reads SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY (or
 * SUPABASE_SERVICE_ROLE_KEY) from the environment or .env.local.
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const require = createRequire(resolve(root, 'apps/web/package.json'));
const { createClient } = await import(pathToFileURL(require.resolve('@supabase/supabase-js')).href);

function readEnvFile() {
  const path = resolve(root, '.env.local');
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

const fileEnv = readEnvFile();
const env = (name) => process.env[name] ?? fileEnv[name] ?? '';
const url = env('SUPABASE_URL').replace(/\/+$/, '');
const publishableKey = env('SUPABASE_PUBLISHABLE_KEY');
const secretKey = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');

const ALPHA = '11111111-1111-1111-1111-111111111111';
const payloads = JSON.parse(readFileSync(resolve(root, 'tooling/security/xss-payloads.json'), 'utf8'));

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok });
  process.stdout.write(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}\n`);
}

/** An active, unescaped payload is one that still contains a raw tag or handler. */
function isExecutable(value) {
  if (typeof value !== 'string') return false;
  return /<script|onerror\s*=|onload\s*=|onfocus\s*=|javascript:/i.test(value);
}

const adminHeaders = {
  apikey: secretKey,
  Authorization: `Bearer ${secretKey}`,
  'Content-Type': 'application/json',
};

async function main() {
  check('env: SUPABASE_URL present', Boolean(url));
  check('env: publishable key present', Boolean(publishableKey));
  check('env: secret/service key present', Boolean(secretKey));
  if (!url || !publishableKey || !secretKey) {
    process.stdout.write('  ABORT: missing credentials.\n');
    process.exit(2);
  }

  const password = `Xs-${randomUUID()}`;
  const email = `${ALPHA}+xss@example.com`;
  const list = await (await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, { headers: adminHeaders })).json();
  const existing = (list?.users ?? []).find((u) => u?.email === email);
  let token;
  if (existing?.id) {
    const s = await (await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: existing?.raw_app_meta_data?.pw ?? password }),
    })).json();
    token = s?.access_token;
  }
  if (!token) {
    const created = await (await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ email, password, app_metadata: { tenant_id: ALPHA, app_role: 'sop_editor' }, email_confirm: true }),
    })).json();
    const s = await (await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })).json();
    token = s?.access_token;
  }
  check('sign-in XSS editor', Boolean(token));

  let failed = 0;
  for (const payload of payloads) {
    const res = await fetch(`${url}/functions/v1/upsert-sop`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `xss-${randomUUID().slice(0, 8)}`, status: 'published', category: 'probe', summary: payload, suggestedReply: '-', escalationRequired: false, triggerKeywords: [] }),
    });
    const body = await res.json().catch(() => ({}));
    const echoed = body?.summary ?? '';
    const dangerous = isExecutable(echoed);
    const ok = !dangerous;
    if (!ok) failed += 1;
    check(`payload stored non-executable: ${payload.slice(0, 40)}`, ok, dangerous ? `echoed raw markup: ${echoed.slice(0, 60)}` : 'escaped/absent');
  }

  const failedChecks = checks.filter((c) => !c.ok);
  process.stdout.write(`\nXSS harness: ${checks.length - failedChecks.length}/${checks.length} checks passed; ${payloads.length} payloads tested.\n`);
  process.exit(failedChecks.length ? 1 : 0);
}

main().catch((err) => {
  process.stdout.write(`  FAIL  unexpected error — ${err?.message ?? err}\n`);
  process.exit(1);
});
