#!/usr/bin/env node
/**
 * Run `verify:deployed` against a LOCAL build of the CURRENT client.
 *
 * Why this exists: the public Vercel URL serves a build from before the tenant-keyed
 * gate (commits f8cbf0b / 565c8c1 / a72ba87 / bbe60e1 are NOT ancestors of the deployed
 * run's `3bab890`), so hitting it re-tests an old client. This harness builds the client
 * from the current working tree, serves it on loopback, and then drives the *same*
 * stranger-path checks at `http://127.0.0.1:<port>` instead of the public URL.
 *
 * It does NOT deploy anything and does NOT touch the Vercel project. The only external
 * effect is on the Supabase dev project — the same effect `verify:deployed` always has
 * (it provisions its own principals and publishes a bundle).
 *
 * Build-time values (Vite inlines them; a change needs a rebuild, not a restart):
 *   VITE_SUPABASE_URL                 <- SUPABASE_URL
 *   VITE_SUPABASE_PUBLISHABLE_KEY     <- SUPABASE_PUBLISHABLE_KEY
 *   VITE_TENANT_SIGNING_PUBLIC_KEY    <- VITE_TENANT_SIGNING_PUBLIC_KEY or SOP_TENANT_SIGNING_PUBLIC_KEY
 *   VITE_SERVER_WRAPPING_PUBLIC_KEY   <- VITE_SERVER_WRAPPING_PUBLIC_KEY or SOP_SERVER_WRAPPING_PUBLIC_KEY
 * All four come from the gitignored `.env.local`; none is ever printed.
 *
 * Usage:
 *   node tooling/browser/verify-deployed-local.mjs
 *
 * Env overrides: PORT (default 5180), DEMO_EMAIL (default a throwaway local address).
 * The demo password is generated per run and never printed — it is installed on the
 * throwaway account by the harness itself.
 */
import { spawn } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.PORT ?? 5180);

function readEnvFile() {
  const v = {};
  for (const line of readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) v[m[1]] = m[2];
  }
  return v;
}
const file = readEnvFile();
const pick = (...names) => {
  for (const n of names) if (process.env[n]) return process.env[n];
  for (const n of names) if (file[n]) return file[n];
  return '';
};

const buildEnv = {
  ...process.env,
  VITE_SUPABASE_URL: pick('SUPABASE_URL'),
  VITE_SUPABASE_PUBLISHABLE_KEY: pick('SUPABASE_PUBLISHABLE_KEY'),
  VITE_TENANT_SIGNING_PUBLIC_KEY: pick('VITE_TENANT_SIGNING_PUBLIC_KEY', 'SOP_TENANT_SIGNING_PUBLIC_KEY'),
  VITE_SERVER_WRAPPING_PUBLIC_KEY: pick('VITE_SERVER_WRAPPING_PUBLIC_KEY', 'SOP_SERVER_WRAPPING_PUBLIC_KEY'),
};
const missing = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_TENANT_SIGNING_PUBLIC_KEY', 'VITE_SERVER_WRAPPING_PUBLIC_KEY'].filter((k) => !buildEnv[k]);
if (missing.length > 0) {
  process.stderr.write(`missing build-time value(s) in .env.local: ${missing.join(', ')}\n`);
  process.exit(2);
}
if (!pick('SUPABASE_SECRET_KEY')) { process.stderr.write('missing SUPABASE_SECRET_KEY in .env.local\n'); process.exit(2); }

// ---- 1. build the current client ------------------------------------------
// Vite empties the outDir first; on this host the safe-delete shim can block that, so
// the directory is removed here before the build starts (the documented workaround).
rmSync(resolve(root, 'apps/web/dist'), { recursive: true, force: true });
process.stdout.write('==> building apps/web from the working tree\n');
const vite = resolve(root, 'apps/web/node_modules/vite/bin/vite.js');
await new Promise((res, rej) => {
  const b = spawn(process.execPath, [vite, 'build'], { cwd: resolve(root, 'apps/web'), env: buildEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  b.stdout.on('data', (c) => (log += c));
  b.stderr.on('data', (c) => (log += c));
  b.on('exit', (code) => (code === 0 ? res() : rej(new Error(`build failed (${code}):\n${log.slice(-800)}`))));
});

// ---- 2. serve it on loopback ----------------------------------------------
const preview = spawn(process.execPath, [vite, 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], { cwd: resolve(root, 'apps/web'), env: buildEnv, stdio: ['ignore', 'pipe', 'pipe'] });
let previewLog = '';
preview.stdout.on('data', (c) => (previewLog += c));
preview.stderr.on('data', (c) => (previewLog += c));
const cleanup = () => preview.kill();
process.on('exit', cleanup);

const target = `http://127.0.0.1:${PORT}`;
let up = false;
for (let i = 0; i < 60 && !up; i += 1) {
  up = Boolean(await fetch(`${target}/`).catch(() => null));
  if (!up) await sleep(300);
}
if (!up) { process.stderr.write(`preview never came up:\n${previewLog.slice(-600)}\n`); process.exit(2); }
process.stdout.write(`==> serving the current build at ${target}\n`);

// ---- 3. drive the stranger-path checks at localhost ------------------------
const demoEmail = process.env.DEMO_EMAIL ?? `deployed-local-${randomUUID().slice(0, 8)}@alpha.example`;
const demoPassword = `Dl-${randomUUID()}`;
const harness = resolve(root, 'tooling/browser/verify-deployed.mjs');
const code = await new Promise((res) => {
  const h = spawn(process.execPath, [harness], {
    cwd: root,
    env: { ...buildEnv, TARGET_URL: target, DEMO_EMAIL: demoEmail, DEMO_PASSWORD: demoPassword },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  h.on('exit', (c) => res(c ?? 1));
});
cleanup();
process.exit(code);
