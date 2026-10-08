#!/usr/bin/env node
/**
 * Build-time scan: prove no secret reaches the client bundle.
 *
 * P5 §6 / probe IE-02. The client is untrusted; anything in `apps/web/dist` is public.
 * This reads the gitignored `.env.local`, takes every value that is a SECRET, and greps
 * the built bundle for it. A hit fails the run.
 *
 * It carries a positive control: the two PUBLIC key halves the app legitimately ships
 * must be found, so a scan that passes because the bundle is empty or unbuilt is caught.
 *
 * Secret VALUES are never printed — only the name of the variable and whether it leaked.
 *
 * Usage:
 *   node tooling/verify-secrets-in-bundle.mjs            # scans apps/web/dist
 *   node tooling/verify-secrets-in-bundle.mjs --build    # builds first, then scans
 */
import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'apps/web/dist');

function readEnvFile() {
  const v = {};
  for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) v[m[1]] = m[2];
  }
  return v;
}
const file = readEnvFile();
const pick = (...names) => { for (const n of names) if (process.env[n]) return process.env[n]; for (const n of names) if (file[n]) return file[n]; return ''; };

if (process.argv.includes('--build')) {
  rmSync(dist, { recursive: true, force: true });
  const vite = resolve(root, 'apps/web/node_modules/vite/bin/vite.js');
  await new Promise((res, rej) => {
    const b = spawn(process.execPath, [vite, 'build'], {
      cwd: resolve(root, 'apps/web'),
      env: {
        ...process.env,
        VITE_SUPABASE_URL: pick('SUPABASE_URL'),
        VITE_SUPABASE_PUBLISHABLE_KEY: pick('SUPABASE_PUBLISHABLE_KEY'),
        VITE_TENANT_SIGNING_PUBLIC_KEY: pick('VITE_TENANT_SIGNING_PUBLIC_KEY', 'SOP_TENANT_SIGNING_PUBLIC_KEY'),
        VITE_SERVER_WRAPPING_PUBLIC_KEY: pick('VITE_SERVER_WRAPPING_PUBLIC_KEY', 'SOP_SERVER_WRAPPING_PUBLIC_KEY'),
      },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    b.on('exit', (c) => (c === 0 ? res() : rej(new Error(`build failed (${c})`))));
  });
}

if (!existsSync(dist)) { process.stderr.write('apps/web/dist is missing — build first (--build)\n'); process.exit(2); }

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const files = walk(dist);
const bundle = files.map((f) => readFileSync(f, 'utf8')).join('\n');

// --- secrets that must NOT appear -------------------------------------------------
// Every *_SECRET / *_PASSWORD / *_PRIVATE value from the environment contract.
const secretNames = ['SUPABASE_SECRET_KEY', 'SUPABASE_DB_PASSWORD', 'SUPABASE_SERVICE_ROLE_KEY'];
const secrets = secretNames.map((n) => [n, pick(n)]).filter(([, v]) => v && v.length >= 16);

// --- public values that MUST appear (positive control) ----------------------------
const publicNames = ['SUPABASE_PUBLISHABLE_KEY', 'SOP_TENANT_SIGNING_PUBLIC_KEY', 'SOP_SERVER_WRAPPING_PUBLIC_KEY'];
const publics = publicNames.map((n) => [n, pick(n)]).filter(([, v]) => v && v.length >= 16);

let failed = 0;
console.log(`scanning ${files.length} file(s) in apps/web/dist`);
for (const [name, value] of secrets) {
  const hit = bundle.includes(value);
  console.log(`  ${hit ? 'FAIL' : 'pass'}  ${name} absent from the bundle`);
  if (hit) failed += 1;
}
for (const [name, value] of publics) {
  const hit = bundle.includes(value);
  console.log(`  ${hit ? 'pass' : 'FAIL'}  ${name} present in the bundle (expected — it is public)`);
  if (!hit) failed += 1;
}
for (const marker of ['service_role', 'BEGIN PRIVATE KEY', 'BEGIN RSA PRIVATE KEY']) {
  const hit = bundle.includes(marker);
  console.log(`  ${hit ? 'FAIL' : 'pass'}  no "${marker}" marker in the bundle`);
  if (hit) failed += 1;
}
if (secrets.length === 0) { console.log('  note  no secret values found in .env.local to test against'); }
console.log('');
if (failed > 0) { console.log(`SECRETS-IN-BUNDLE SCAN FAILED: ${failed} check(s)`); process.exit(1); }
console.log('SECRETS-IN-BUNDLE SCAN OK');
