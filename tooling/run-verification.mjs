#!/usr/bin/env node
/**
 * The verification gate.
 *
 * Every harness that backs a claim in AGENTS.md, run in one command, in one
 * place, with a verdict that cannot be faked.
 *
 * Why this exists. Until now the harnesses were only ever run by hand, one at a
 * time, by whoever wrote them. Nothing ran on a commit, so "31 checks, 0
 * failures" was a recollection rather than a fact. This runner is what turns it
 * into a fact, and it is the command CI runs.
 *
 * Two independent signals per suite, following the pattern the database scripts
 * already use: the process must exit 0 AND the suite must print its own verdict
 * line. A suite that exits 0 while reporting failures is precisely the failure
 * mode worth catching, and it is the one a naive `&&` chain would wave through.
 *
 * The database suites are not here. They need a throwaway PostgreSQL and live in
 * `pnpm verify:db`, which supersedes the phase 2 and phase 5 scripts by running
 * all three SQL suites against one freshly created database.
 *
 * The `semantic-eval` and `reranker-sanity` scripts are deliberately excluded:
 * they measure and report, they are the experiments AGENTS.md already records as
 * rejected, and a number that moves is not a regression. Model swapping has
 * been measured and rejected twice; it does not belong in a merge gate.
 *
 * Usage:
 *   node tooling/run-verification.mjs              # every suite
 *   node tooling/run-verification.mjs sync gate    # only the named suites
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Build outputs the harnesses import. Without these they fail with a module
 * resolution error, which says nothing about the code under test; this turns
 * that into an instruction.
 */
const REQUIRED_BUILDS = [
  'packages/core/dist/index.js',
  'packages/embedder/dist/index.js',
  'packages/vector-store/dist/index.js',
  'packages/sync/dist/index.js',
];

const SUITES = [
  {
    key: 'parity',
    name: 'legacy parity (keyword rule)',
    script: 'tooling/eval/parity-check.mjs',
    verdict: 'PARITY OK',
  },
  {
    key: 'sync',
    name: 'encrypted sync protocol',
    script: 'tooling/sync/verify-sync.mjs',
    verdict: 'SYNC VERIFICATION OK',
    downloadsModel: true,
  },
  {
    key: 'persistence',
    name: 'persistence adapters',
    script: 'tooling/sync/verify-persistence.mjs',
    verdict: 'PERSISTENCE VERIFICATION OK',
  },
  {
    key: 'rotation',
    name: 'key rotation and revocation',
    script: 'tooling/sync/verify-rotation.mjs',
    verdict: 'ROTATION VERIFICATION OK',
  },
  {
    key: 'gate',
    name: 'confidence gate and manual review',
    script: 'tooling/gate/verify-gate.mjs',
    verdict: 'GATE VERIFICATION OK',
    downloadsModel: true,
  },
  {
    key: 'queue',
    name: 'telemetry queue',
    script: 'tooling/telemetry/verify-queue.mjs',
    verdict: 'QUEUE VERIFICATION OK',
  },
  {
    key: 'conflicts',
    name: 'conflicting-procedure lint',
    script: 'tooling/conflicts/verify-conflict-lint.mjs',
    verdict: 'CONFLICT LINT VERIFICATION OK',
  },
  {
    key: 'publish-block',
    name: 'publish-path conflict block (option a)',
    script: 'tooling/conflicts/verify-publish-conflict-block.mjs',
    verdict: 'PUBLISH CONFLICT BLOCK OK',
  },
  {
    key: 'audit-gate',
    name: 'dependency gate negative controls',
    script: 'tooling/verify-audit-gate.mjs',
    verdict: 'AUDIT GATE VERIFICATION OK',
  },
  {
    key: 'publish-model',
    name: 'publish-path model policy (server half of D7)',
    script: 'tooling/verify-publish-model-policy.mjs',
    verdict: 'PUBLISH MODEL POLICY OK',
  },
  {
    key: 'corpus-gates',
    name: 'corpus licence and privacy gates',
    script: 'tooling/verify-corpus-gates.mjs',
    verdict: 'CORPUS GATE VERIFICATION OK',
  },
  {
    key: 'pii-recall',
    name: 'planted-PII recall',
    script: 'tooling/verify-pii-recall.mjs',
    verdict: 'PII RECALL OK',
  },
  {
    key: 'pii-heldout',
    name: 'planted-PII held-out recall (now a regression guard)',
    script: 'tooling/verify-pii-heldout.mjs',
    verdict: 'HELD-OUT RECALL OK',
  },
  {
    key: 'agent-skill',
    name: 'Hatem_specific agent skill enforcement',
    script: 'tooling/verify-agent-skill.mjs',
    verdict: '[verify-agent-skill] OK',
  },
  {
    // The Market Twin smoke rung (V2 §P2). It belongs in the gate because it ASSERTS invariants
    // and exits non-zero when one fails — unlike semantic-eval and reranker-sanity, which measure
    // and report. The seed is fixed so the gate compares a decision digest, not a moving number.
    key: 'market-smoke',
    name: 'Market Twin smoke rung (deterministic)',
    script: 'tooling/market/run-market.mjs',
    args: ['--seed', '20261006', '--rung', 'smoke'],
    verdict: 'MARKET TWIN SMOKE OK',
  },
  {
    // The pinned smoke digest (V2 §P2; the D8 class of defect — a published number nothing
    // enforces). Until 2026-10-09 this file was checked by nothing in the gate: the smoke
    // suite above runs run-market.mjs directly, and the digest comparison was reachable only
    // through `pnpm run verify:p2-smoke`, which is in neither the gate nor CI.
    //
    // It belongs in the gate because it ASSERTS: the pinned seed's decision digest must equal
    // tooling/market/smoke-golden-digest.json, the generated reports must stay untracked, AND
    // the check must be able to FAIL — `--negative-control` tampers a copy of the golden digest
    // and requires the comparison to reject it.
    //
    // Must run AFTER market-smoke: it reads the report that suite writes.
    key: 'market-digest',
    name: 'Market Twin golden smoke digest (+ negative control)',
    script: 'tooling/market/verify-p2-smoke-digest.mjs',
    args: ['--negative-control'],
    verdict: 'P2 SMOKE DIGEST OK',
  },
  {
    // Render-path XSS harness (textContent) — V2 §5 P5, II-02 and OS-01.
    //
    // WHAT IT PROVES: hostile payloads are inert when rendered with `textContent`, the
    // exact mechanism the app's React text children use.
    // WHAT IT DOES NOT PROVE: that the app is inert. The payloads go through a stand-in
    // page, not the built client, so the REAL client render path is NOT yet proven. That
    // needs tooling/security/verify-xss-client-path.mjs against a live backend.
    //
    // It belongs in the gate because it ASSERTS and exits non-zero: 21 payloads must render
    // inert, AND the negative control must fire — an `innerHTML` renderer has to inject DOM,
    // or the harness cannot detect an unsafe renderer and the whole pass is vacuous — AND the
    // served document must carry a strict CSP with no inline script-src. It needs a Chrome
    // install; CHROME_PATH overrides the Windows default.
    key: 'xss',
    name: 'render-path XSS harness (textContent)',
    script: 'tooling/security/xss-harness.mjs',
    verdict: 'XSS HARNESS OK',
  },
  {
    // Desktop CSP (HI-03). The Tauri shell shipped `app.security.csp: null`,
    // which disables the WebView policy every other XSS control assumes. This
    // suite asserts the production policy is strict (script-src 'self', no
    // inline/eval, object-src 'none') and that the checker rejects the original
    // null policy as a negative control.
    key: 'desktop-csp',
    name: 'desktop CSP (Tauri)',
    script: 'tooling/security/verify-desktop-csp.mjs',
    verdict: 'DESKTOP CSP OK',
  },
  {
    // HI-05: `.env.example` shipped the development project's real ref while
    // the readiness doc claimed placeholder-only. This suite scans the files an
    // operator copies or a workflow reads, and runs a negative control proving
    // a 20-character ref is detected.
    key: 'project-refs',
    name: 'configuration carries no real project refs',
    script: 'tooling/security/verify-no-real-project-refs.mjs',
    verdict: 'NO REAL PROJECT REFS OK',
  },
];

const requested = process.argv.slice(2);
const selected =
  requested.length === 0
    ? SUITES
    : SUITES.filter((suite) => requested.includes(suite.key));

if (selected.length === 0) {
  process.stderr.write(
    `no suite matched: ${requested.join(', ')}\n` +
      `available: ${SUITES.map((suite) => suite.key).join(', ')}\n`,
  );
  process.exit(2);
}

const missing = REQUIRED_BUILDS.filter((path) => !existsSync(resolve(root, path)));

if (missing.length > 0) {
  process.stderr.write(
    'build output missing, so these suites cannot run:\n' +
      missing.map((path) => `  ${path}\n`).join('') +
      '\nrun `pnpm build` first.\n',
  );
  process.exit(2);
}

if (selected.some((suite) => suite.downloadsModel)) {
  process.stdout.write(
    'note: the pinned embedding model is fetched from Hugging Face on first run ' +
      'and cached in ./.cache\n\n',
  );
}

function runSuite(suite) {
  return new Promise((settle) => {
    const child = spawn(process.execPath, [suite.script, ...(suite.args ?? [])], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'inherit'],
    });

    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      process.stdout.write(chunk);
    });

    child.on('error', (error) => settle({ ok: false, reason: String(error) }));
    child.on('close', (code) => {
      if (code !== 0) {
        settle({ ok: false, reason: `exited ${code}` });
        return;
      }
      if (!output.includes(suite.verdict)) {
        settle({ ok: false, reason: `exited 0 but never printed "${suite.verdict}"` });
        return;
      }
      settle({ ok: true });
    });
  });
}

const results = [];

for (const suite of selected) {
  process.stdout.write(`==> ${suite.name}\n\n`);
  const started = process.hrtime.bigint();
  const result = await runSuite(suite);
  const seconds = Number(process.hrtime.bigint() - started) / 1e9;
  results.push({ suite, ...result, seconds });
  process.stdout.write(`    ${result.ok ? 'pass' : `FAIL — ${result.reason}`} (${seconds.toFixed(1)}s)\n\n`);
}

const passed = results.filter((result) => result.ok).length;

process.stdout.write('verification summary\n');
for (const result of results) {
  const status = result.ok ? 'pass' : `FAIL (${result.reason})`;
  process.stdout.write(`  ${status.padEnd(6)} ${result.suite.name}\n`);
}
process.stdout.write(`\n${passed} of ${results.length} suites passed\n`);

process.exit(passed === results.length ? 0 : 1);
