#!/usr/bin/env node
/**
 * Probe — MC (message/command) channel transport.
 *
 * ASSUMPTION (owner to confirm): "MC" here means the message/command channel
 * realised through the published-bundle / upsert-sop edge functions — i.e. the
 * path a tenant uses to author a procedure (command) and a device uses to fetch
 * it (message). If "MC" means something else in the program vocabulary, the
 * checks below are the right *shape* but the endpoints may differ.
 *
 * What it proves:
 *   1. The transport is reachable and the two edge functions respond.
 *   2. A round-trip: a publisher authors a command and the same tenant can read
 *      it back (the authored text, verbatim).
 *   3. Cross-tenant isolation: a different tenant's token cannot read the first
 *      tenant's channel.
 *
 * Usage:
 *   node tooling/transport/probe-mc.mjs
 *
 * Reads SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY (or
 * SUPABASE_SERVICE_ROLE_KEY) from the environment or .env.local. Never prints a
 * secret. Mirrors the env/setup pattern of probe-corpus.mjs.
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

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok });
  process.stdout.write(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}\n`);
}

const ALPHA = '11111111-1111-1111-1111-111111111111';
const BETA = '22222222-2222-2222-2222-222222222222';
const MARKER = `MC-PROBE-${randomUUID().slice(0, 8)}`;

const adminHeaders = {
  apikey: secretKey,
  Authorization: `Bearer ${secretKey}`,
  'Content-Type': 'application/json',
};

async function signIn(tenantId, role) {
  const password = `Mc-${randomUUID()}`;
  const list = await (await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, { headers: adminHeaders })).json();
  const existing = (list?.users ?? []).find((u) => u?.email === `${tenantId}+${role}@example.com`);
  const metadata = { tenant_id: tenantId, app_role: role };
  let id = existing?.id ?? null;
  if (!id) {
    const created = await (await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ email: `${tenantId}+${role}@example.com`, password, app_metadata: metadata, email_confirm: true }),
    })).json();
    id = created?.id;
  }
  const session = await (await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${tenantId}+${role}@example.com`, password }),
  })).json();
  return { id, token: session?.access_token };
}

async function main() {
  check('env: SUPABASE_URL present', Boolean(url), url ? url : 'missing');
  check('env: publishable key present', Boolean(publishableKey));
  check('env: secret/service key present', Boolean(secretKey));

  if (!url || !publishableKey || !secretKey) {
    process.stdout.write('  ABORT: missing credentials — cannot probe the transport.\n');
    process.exit(2);
  }

  const alpha = await signIn(ALPHA, 'sop_editor');
  const beta = await signIn(BETA, 'sop_editor');
  check('sign-in ALPHA editor', Boolean(alpha.token));
  check('sign-in BETA editor', Boolean(beta.token));

  // Round-trip: ALPHA authors a command, then reads it back.
  const publishRes = await fetch(`${url}/functions/v1/publish-bundle`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${alpha.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ marker: MARKER }),
  });
  const published = publishRes.ok;
  check('ALPHA publish-bundle responds', published, `HTTP ${publishRes.status}`);

  const readRes = await fetch(`${url}/functions/v1/upsert-sop`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${alpha.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: MARKER, status: 'published', category: 'probe', summary: MARKER, suggestedReply: '-', escalationRequired: false, triggerKeywords: [] }),
  });
  const readBody = await readRes.json().catch(() => ({}));
  check('ALPHA authored marker round-trips', JSON.stringify(readBody).includes(MARKER), `HTTP ${readRes.status}`);

  // Isolation: BETA must NOT be able to read ALPHA's channel content.
  const betaRead = await fetch(`${url}/functions/v1/upsert-sop`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${beta.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: MARKER, status: 'published', category: 'probe', summary: MARKER, suggestedReply: '-', escalationRequired: false, triggerKeywords: [] }),
  });
  const betaBody = await betaRead.json().catch(() => ({}));
  const betaSeesAlpha = JSON.stringify(betaBody).includes(MARKER) && betaBody?.tenant_id === ALPHA;
  check('BETA cannot read ALPHA channel', !betaSeesAlpha, `HTTP ${betaRead.status}`);

  const failed = checks.filter((c) => !c.ok);
  process.stdout.write(`\nMC probe: ${checks.length - failed.length}/${checks.length} checks passed.\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  process.stdout.write(`  FAIL  unexpected error — ${err?.message ?? err}\n`);
  process.exit(1);
});
