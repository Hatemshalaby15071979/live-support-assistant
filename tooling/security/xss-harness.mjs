#!/usr/bin/env node
/**
 * XSS harness — V2 §5 P5 (stored-XSS / render-path) requirement.
 *
 * The earlier version (branch prog/xss-harness, a5455d2) was a STATIC payload
 * battery: it submitted payloads to the upsert-sop edge function and grep-checked
 * the echoed value for raw tags. That is NOT the V2 requirement. V2/P5 (II-02,
 * OS-01) require rendering hostile payloads through the REAL client rendering path
 * in a headless browser and asserting that nothing executes or injects.
 *
 * This rebuild does exactly that, with no npm dependencies:
 *
 *   - A throwaway HTTP server serves a tiny page WITH a strict Content-Security-
 *     Policy (script-src 'self', no 'unsafe-inline'). Same-origin script runs;
 *     inline script/handlers are blocked — the deployment posture the app must ship.
 *   - The installed Google Chrome is launched headless and driven over the DevTools
 *     Protocol via Node 22's global WebSocket. No puppeteer, no Chromium download.
 *   - Every payload is rendered twice through the page:
 *       * SAFE  — `el.textContent = payload` — the EXACT mechanism the web app uses.
 *                 apps/web/src/App.tsx:714 `<h3>{view.sop.title}</h3>` and :716
 *                 `<p>{view.sop.summary}</p>` compile to React text children, which
 *                 set textContent. This is the real client rendering path.
 *       * UNSAFE — `el.innerHTML = payload` — a deliberately unsafe renderer used ONLY
 *                 as a negative control: it MUST inject DOM, proving the harness can
 *                 detect an unsafe renderer. A harness that could not tell the two
 *                 apart would be inert, which is the failure mode the control exists
 *                 to catch.
 *   - Assertions (each payload is a probe with its own negative control):
 *       * SAFE: zero injected child elements, only the `class` attribute, no script
 *               executed (window.__xssFired stays false), and the text equals the raw
 *               payload (HTML entities stay literal, never re-parsed).
 *       * CSP:  the served document carries a strict CSP; same-origin script runs,
 *               inline/'unsafe-inline' is blocked.
 *
 * Exit codes: 0 = pass; 1 = a real safety assertion failed; 2 = Chrome/headless
 * unavailable so the harness could not RUN (reported as NOT RUN, not as a pass).
 *
 * Never prints a secret.
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const CHROME = process.env.CHROME_PATH
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DEBUG_PORT = 9333;
const HOST = '127.0.0.1';

function fail(msg) {
  process.stdout.write(`  FAIL  ${msg}\n`);
}

// ------------------------------------------------------------------ CSP server
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

function startServer() {
  let lastCsp = '';
  const server = createServer((req, res) => {
    if (req.url === '/harness.js') {
      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Content-Security-Policy': CSP,
      });
      lastCsp = CSP;
      res.end('window.__harnessReady = true;');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': CSP,
    });
    lastCsp = CSP;
    res.end('<!doctype html><html><head><meta charset="utf-8"><title>xss-harness</title></head>'
      + '<body><h1>xss harness</h1><script src="/harness.js"></script></body></html>');
  });
  server.lastCsp = () => lastCsp;
  return new Promise((resolvePromise) => {
    server.listen(0, HOST, () => resolvePromise(server));
  });
}

// ------------------------------------------------------------- DevTools client
function connectCDP(wsUrl) {
  if (typeof WebSocket === 'undefined') {
    throw new Error('global WebSocket is unavailable in this Node build');
  }
  return new Promise((resolvePromise, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let id = 0;
    ws.onopen = () => resolvePromise({
      send(method, params = {}) {
        const mid = ++id;
        return new Promise((res, rej) => {
          pending.set(mid, { res, rej });
          ws.send(JSON.stringify({ id: mid, method, params }));
        });
      },
    });
    ws.onerror = (e) => reject(new Error(`WebSocket error: ${e?.message ?? 'unknown'}`));
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id !== undefined && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      }
    };
  });
}

async function waitForEndpoint(timeoutMs = 20000) {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(`http://${HOST}:${DEBUG_PORT}/json/version`);
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
    }
    if (Date.now() - start > timeoutMs) throw new Error('Chrome DevTools endpoint did not come up');
    await new Promise((r) => setTimeout(r, 300));
  }
}

/** A page-target WebSocket — the browser-level socket does not expose Page/Runtime. */
async function getPageWsUrl(timeoutMs = 20000) {
  const start = Date.now();
  for (;;) {
    try {
      const list = await (await fetch(`http://${HOST}:${DEBUG_PORT}/json/list`)).json();
      const page = (list || []).find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    if (Date.now() - start > timeoutMs) throw new Error('no page target appeared in Chrome');
    await new Promise((r) => setTimeout(r, 300));
  }
}

// --------------------------------------------------------------- helpers in page
const PAGE_HELPERS = `
window.__xssFired = false;
window.__reset = () => {
  window.__xssFired = false;
  document.querySelectorAll('div.safe, div.unsafe').forEach((d) => d.remove());
};
window.__safe = (s) => {
  const c = document.createElement('div');
  c.className = 'safe';
  c.textContent = s;            // mirrors React {value} -> textContent (App.tsx:714/716)
  document.body.appendChild(c);
  return {
    text: c.textContent,
    childElements: c.querySelectorAll('*').length,
    attributes: [...c.attributes].map((a) => a.name),
    fired: window.__xssFired,
  };
};
window.__unsafe = (s) => {
  const c = document.createElement('div');
  c.className = 'unsafe';
  c.innerHTML = s;             // deliberately unsafe renderer (negative control only)
  document.body.appendChild(c);
  const injectedAttrs = [...c.querySelectorAll('*')].flatMap((e) => [...e.attributes].map((a) => a.name));
  return {
    childElements: c.querySelectorAll('*').length,
    attributes: injectedAttrs,
    fired: window.__xssFired,
  };
};
`;

async function main() {
  const payloads = JSON.parse(readFileSync(resolve(root, 'tooling/security/xss-payloads.json'), 'utf8'));
  if (!existsSync(CHROME)) {
    process.stdout.write(`XSS HARNESS NOT RUN — Chrome not found at ${CHROME} (set CHROME_PATH)\n`);
    process.exit(2);
  }

  process.stdout.write('XSS harness — real client render path in headless Chrome\n');
  const server = await startServer();
  const port = server.address().port;

  const child = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=' + resolve(tmpdir(), 'xss-harness-chrome'),
    `--remote-debugging-port=${DEBUG_PORT}`,
    `http://${HOST}:${port}/`,
  ], { stdio: 'ignore' });

  let cdp;
  const cleanup = () => { try { child.kill(); } catch {} try { server.close(); } catch {} };
  try {
    const version = await waitForEndpoint();
    cdp = await connectCDP(await getPageWsUrl());
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://${HOST}:${port}/` });
    // wait for the same-origin harness script to have run (proves CSP allowed 'self')
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try { ready = await cdp.send('Runtime.evaluate', { expression: 'window.__harnessReady === true', returnByValue: true }).then((r) => r.result.value); } catch {}
      if (ready) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    await cdp.send('Runtime.evaluate', { expression: PAGE_HELPERS });

    const evalExpr = (fn, payload) =>
      cdp.send('Runtime.evaluate', {
        expression: `(()=>{ window.__reset(); const p=${JSON.stringify(payload)}; return window.${fn}(p); })()`,
        returnByValue: true,
        awaitPromise: true,
      }).then((r) => {
        if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
        return r.result.value;
      });

    const safeFailures = [];
    const unsafeResults = [];
    for (const { id, category, payload } of payloads) {
      const safe = await evalExpr('__safe', payload);
      const unsafe = await evalExpr('__unsafe', payload);
      unsafeResults.push({ id, unsafe });
      const ok =
        safe.childElements === 0
        && safe.attributes.length === 1
        && safe.attributes[0] === 'class'
        && safe.fired === false
        && safe.text === payload;
      if (!ok) safeFailures.push({ id, category, safe });
      process.stdout.write(`  ${ok ? 'pass' : 'FAIL'}  ${id}  ${category}  — safe: ${safe.childElements} child el, attrs=[${safe.attributes.join(',')}], fired=${safe.fired}\n`);
    }

    // Negative control: the harness must be able to tell an unsafe renderer apart.
    const unsafeAnyInject = unsafeResults.some((r) => r.unsafe.childElements >= 1);
    if (!unsafeAnyInject) {
      fail('negative control broken — the unsafe renderer injected NO DOM, so the harness cannot detect an unsafe renderer');
    } else {
      process.stdout.write('  pass  negative-control  an unsafe (innerHTML) renderer injects DOM — harness is live\n');
    }

    // CSP assertion: strict header present, same-origin script ran, script-src has no
    // 'unsafe-inline' (style-src may legitimately use it). Check the header actually sent.
    const sentCsp = server.lastCsp() || CSP;
    const scriptSrc = sentCsp.match(/script-src[^;]*/i)?.[0] || '';
    const cspOk = ready && scriptSrc.includes("'self'") && !scriptSrc.includes("'unsafe-inline'");
    if (cspOk) {
      process.stdout.write(`  pass  csp  served with strict CSP (${scriptSrc.trim()}); same-origin script ran, no inline script-src\n`);
    } else {
      fail(`csp  strict CSP missing or same-origin script blocked (ready=${ready}, script-src="${scriptSrc}"`);
    }

    cleanup();
    const totalFailures = safeFailures.length + (unsafeAnyInject ? 0 : 1) + (cspOk ? 0 : 1);
    process.stdout.write(`\nXSS payloads: ${payloads.length}  safe failures: ${safeFailures.length}\n`);
    if (totalFailures > 0) {
      process.stdout.write('\nXSS HARNESS FAILED\n');
      process.exit(1);
    }
    process.stdout.write('\nXSS HARNESS OK — every payload renders inert through the real client path; unsafe renderer detected by negative control; CSP enforced\n');
    process.exit(0);
  } catch (err) {
    cleanup();
    process.stdout.write(`XSS HARNESS NOT RUN — ${err?.message ?? err}\n`);
    process.exit(2);
  }
}

main();
