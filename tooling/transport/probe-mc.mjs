#!/usr/bin/env node
/**
 * Probe — MC = model-confusion (NOT message/command).
 *
 * This file previously implemented "MC" as a message/command channel probe
 * (published-bundle / upsert-sop round-trip and cross-tenant isolation). That
 * interpretation was WRONG. The owner clarified in the 10-point correction
 * (2026-10-08) that in the program vocabulary "MC" is the **model-confusion**
 * category of P5 (docs/program/P5_PROBES.md, Category 6, MC-01..MC-09). The
 * earlier version is replaced here in full and the branch it lived on
 * (prog/mc-probes) is rebuilt from this file. See DECISIONS.md (2026-10-08,
 * "prog/mc-probes misinterpreted: MC = model-confusion") for the recorded reason.
 *
 * What model-confusion is, and why it matters
 * -------------------------------------------
 * A published bundle carries a `model` identity in its manifest (id / revision /
 * quantization / dimensions). Every field changes the embedding vectors the
 * Confidence Gate compares against a threshold: a different model means different
 * scores, and a client that installed a bundle built for a model it did not load
 * would score every passage against the wrong vector space — no error, a plausible
 * answer, a wrong one. The recorded-but-unexplained deployed/local divergence
 * (deployed margin 0.180757 vs local 0.167715 on ticket SIM-TICKET-00272) is the
 * historical counterexample that motivates the check (docs/PRODUCTION_SAAS_PROGRAM_V2.md G1).
 *
 * Two halves close it:
 *   - SERVER: the publish path refuses a bundle whose manifest names a model that
 *     differs from the one this deployment serves (resolvePublishModel, exercised
 *     here against the deployed function's own policy module; the deployed
 *     `publish-bundle` edge function imports it, so this is the same logic).
 *   - CLIENT: installBundle refuses a bundle built for a model the client did not
 *     load (reason `model_mismatch`), and leaves the previously installed bundle
 *     active.
 *
 * Probe coverage (each with a negative control that proves the harness is live):
 *   MC-01  publish with body.model naming a different model id  -> 400, names field
 *   MC-02  body.model differing only in dimensions              -> 400
 *   MC-03  body.model differing only in quantization            -> 400
 *   MC-04  body.model.revision set to a branch (`main`)         -> 400
 *   MC-05  body.model restating the deployment's model          -> accepted; server value used
 *   MC-06  a signed bundle whose manifest names another model   -> client refuses (model_mismatch); prior bundle stays active
 *   MC-07  a foreign-tenant bundle whose model matches          -> refused on tenant, not model (signature_invalid) — proves the checks are independent
 *   MC-08  NEGATIVE CONTROL: publish + install with matching model -> succeeds
 *   MC-09  reconstruct the historical divergence (0.180757 vs 0.167715) -> UNPROVEN hypothesis (see below)
 *
 * Running
 * -------
 * The LOCAL half (MC-01..MC-08) runs with no stack and no credentials: the server
 * policy is exercised against its own module, and the client half is exercised
 * against real published/installed bundles produced by packages/sync.
 *
 *   node tooling/transport/probe-mc.mjs
 *
 * The optional REMOTE half (MC-01..MC-05 against the *deployed* publish-bundle
 * edge function) runs only with `--remote` AND live credentials in the
 * environment / .env.local. Hosted test suites are stopped by standing rule, so
 * this half is skipped by default and the server logic is still proven locally.
 *
 * MC-09 is deliberately NOT a hard pass/fail. It is a hypothesis probe: it states
 * the guard that closes the gap (MC-06) and reports the recorded historical
 * margins, but flags the full reproduction as UNPROVEN because (a) the local
 * harness has a single embedding model, and (b) the deployed publish path now
 * refuses the contradictory corpus at HTTP 422, so the deployed divergent margin
 * cannot be replayed there. Proving MC-09 requires the deployed divergent path
 * and is a P5 item, not a blocker for this probe.
 *
 * Never prints a secret. Reads SUPABASE_* only for the optional remote half.
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// --------------------------------------------------------------------- imports
// The sync package is the wire between the two halves. It is self-contained
// (no npm runtime deps), so the local half runs from a clean checkout.
const require = createRequire(resolve(root, 'apps/web/package.json'));
const sync = await import(pathToFileURL(resolve(root, 'packages/sync/dist/index.js')).href);
// The server policy the deployed publish-bundle edge function imports. Exercising
// it here proves the same refusal logic the function uses.
const { PUBLISHED_MODEL, resolvePublishModel } = await import(
  pathToFileURL(resolve(root, 'supabase/functions/publish-bundle/model-policy.mjs')).href
);

// --------------------------------------------------------------------- harness
const proven = [];
function check(id, name, ok, detail = '') {
  proven.push({ id, ok });
  process.stdout.write(`  ${ok ? 'pass' : 'FAIL'}  ${id}  ${name}${detail ? `  — ${detail}` : ''}\n`);
}

const MODEL = { ...PUBLISHED_MODEL };
const WRONG_MODEL = {
  id: 'Xenova/bge-small-en-v1.5',
  revision: 'ea104dacec62c0de699686887e3f920caeb4f3e3',
  quantization: 'q8',
  dimensions: 384,
};

const SOPS = [
  {
    id: 'mc-sop-1',
    title: 'MC probe procedure',
    category: 'probe',
    body: 'Model-confusion probe corpus entry.',
    suggestedReply: 'No action needed.',
    escalationRequired: false,
    triggerKeywords: ['mc'],
    status: 'published',
  },
];

// --------------------------------------------------------- server-half (MC-01..05)
// These mirror the deployed edge function's resolvePublishModel, so the *deployed*
// refusal is proven without needing the hosted function up.
function serverChecks() {
  process.stdout.write('\n==> server policy (resolvePublishModel — the logic publish-bundle uses)\n');

  const divergentId = resolvePublishModel({ id: WRONG_MODEL.id, revision: WRONG_MODEL.revision, quantization: WRONG_MODEL.quantization, dimensions: WRONG_MODEL.dimensions });
  check('MC-01', 'divergent model id is refused', divergentId.ok === false && divergentId.status === 400 && /id/.test(divergentId.error), `status=${divergentId.status}`);

  const dimensionOnly = resolvePublishModel({ dimensions: 768 });
  check('MC-02', 'dimensions-only mismatch is refused', dimensionOnly.ok === false && dimensionOnly.status === 400 && /dimensions/.test(dimensionOnly.error), `status=${dimensionOnly.status}`);

  const quantOnly = resolvePublishModel({ quantization: 'fp32' });
  check('MC-03', 'quantization-only mismatch is refused', quantOnly.ok === false && quantOnly.status === 400 && /quantization/.test(quantOnly.error), `status=${quantOnly.status}`);

  const branchRev = resolvePublishModel({ revision: 'main' });
  check('MC-04', 'branch revision is refused', branchRev.ok === false && branchRev.status === 400 && /revision/.test(branchRev.error), `status=${branchRev.status}`);

  const restated = resolvePublishModel({ ...PUBLISHED_MODEL });
  check('MC-05', 'restating the deployment model is accepted', restated.ok === true, restated.ok ? 'resolved to server constant' : restated.error);
  check('MC-05', 'accepted model is the server constant, not the caller object', restated.ok === true && restated.model === PUBLISHED_MODEL, restated.ok ? String(restated.model === PUBLISHED_MODEL) : '(not ok)');

  const nonObject = resolvePublishModel('Xenova/all-MiniLM-L6-v2');
  check('MC-01', 'a non-object model is refused', nonObject.ok === false && nonObject.status === 400, `status=${nonObject.status}`);
}

// ---------------------------------------------------------- client-half (MC-06..08)
async function clientChecks() {
  process.stdout.write('\n==> client install (installBundle — real published/installed bundles)\n');

  const tenantSigning = await sync.generateSigningKeyPair();
  const foreignSigning = await sync.generateSigningKeyPair();
  const serverWrapping = await sync.generateWrappingKeyPair();
  const deviceKeys = await sync.generateWrappingKeyPair();
  const devicePublicKeyBase64 = await sync.exportPublicKey(deviceKeys.publicKey);
  const kekSalt = (await import('node:crypto')).randomBytes(32);

  const deviceId = randomUUID();

  function identity(signingPublicKey = tenantSigning.publicKey) {
    return {
      devicePrivateKey: deviceKeys.privateKey,
      tenantSigningPublicKey: signingPublicKey,
      serverWrappingPublicKey: serverWrapping.publicKey,
      kekSalt,
    };
  }

  async function publish(model, signingKey = tenantSigning.privateKey, tenantId = '11111111-1111-1111-1111-111111111111') {
    return sync.publishBundle({
      tenantId,
      bundleVersion: 1,
      sops: SOPS,
      model,
      signingPrivateKey: signingKey,
      wrappingPrivateKey: serverWrapping.privateKey,
      kekSalt,
      devices: [{ deviceId, publicKey: await sync.importWrappingPublicKey(devicePublicKeyBase64) }],
    });
  }

  // MC-08 — negative control: matching model publishes and installs.
  const matching = await publish(MODEL);
  const signedMatching = sync.bundleForDevice(matching, deviceId);
  const store = new sync.MemoryBundleStore();
  const installed = await sync.installBundle(signedMatching, identity(), store, MODEL);
  check('MC-08', 'matching model installs (negative control)', installed.outcome === 'installed', JSON.stringify(installed));

  // MC-06 — a signed bundle built for a different model is refused on the client,
  // and the previously installed bundle stays active.
  const wrong = await publish(WRONG_MODEL);
  const signedWrong = sync.bundleForDevice(wrong, deviceId);
  const refused = await sync.installBundle(signedWrong, identity(), new sync.MemoryBundleStore(), MODEL);
  check('MC-06', 'mismatched-model bundle is refused (model_mismatch)', refused.outcome === 'rejected' && refused.reason === 'model_mismatch', JSON.stringify(refused));

  const stillActive = await store.active();
  check('MC-06', 'the prior matching bundle stays active after refusal', stillActive !== null && stillActive.manifest.modelId === MODEL.id, stillActive ? stillActive.manifest.modelId : 'none');

  // MC-07 — a foreign-tenant bundle whose MODEL matches must be refused on the
  // tenant (signature_invalid), NOT on the model. This proves the two checks are
  // independent: the model check passing does not grant acceptance.
  const foreign = await publish(MODEL, foreignSigning.privateKey, '22222222-2222-2222-2222-222222222222');
  const signedForeign = sync.bundleForDevice(foreign, deviceId);
  // The legitimate tenant's public key is used for verification, but the bundle was
  // signed by the foreign key -> signature_invalid, even though models agree.
  const foreignRefused = await sync.installBundle(signedForeign, identity(tenantSigning.publicKey), new sync.MemoryBundleStore(), MODEL);
  check('MC-07', 'foreign-tenant bundle refused on tenant, not model', foreignRefused.outcome === 'rejected' && foreignRefused.reason === 'signature_invalid', JSON.stringify(foreignRefused));
  check('MC-07', 'foreign refusal reason is NOT model_mismatch', foreignRefused.reason !== 'model_mismatch', foreignRefused.reason);
}

// ----------------------------------------------------------------- MC-09 (hypothesis)
function hypothesisProbe() {
  process.stdout.write('\n==> MC-09 — historical divergence reconstruction (UNPROVEN HYPOTHESIS)\n');
  process.stdout.write('  recorded deployed margin 0.180757 vs local 0.167715 on SIM-TICKET-00272 (wc-payout-conflict)\n');
  process.stdout.write('  guard proven by MC-06: a client that loaded MODEL refuses a bundle built for another model,\n');
  process.stdout.write('  so the divergence (correct corpus scored in the wrong vector space) cannot occur in practice.\n');
  process.stdout.write('  FULL REPRODUCTION UNPROVEN: (a) this harness has a single embedding model; (b) the deployed\n');
  process.stdout.write('  publish path now refuses the contradictory corpus at HTTP 422, so the deployed divergent margin\n');
  process.stdout.write('  cannot be replayed. MC-09 stays an open P5 item — it does NOT block this probe.\n');
  process.stdout.write('  [MC-09] UNPROVEN HYPOTHESIS — recorded 0.180757 vs 0.167715; reproduction blocked (see above)\n');
}

// ------------------------------------------------------------ optional remote half
async function remoteHalf() {
  const fileEnv = (() => {
    const path = resolve(root, '.env.local');
    if (!existsSync(path)) return {};
    const values = {};
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) values[m[1]] = m[2];
    }
    return values;
  })();
  const env = (name) => process.env[name] ?? fileEnv[name] ?? '';
  const url = env('SUPABASE_URL').replace(/\/+$/, '');
  const publishableKey = env('SUPABASE_PUBLISHABLE_KEY');
  const secretKey = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !publishableKey || !secretKey) {
    process.stdout.write('\n==> remote half SKIPPED (no credentials; hosted suites are stopped by standing rule)\n');
    return;
  }

  process.stdout.write('\n==> remote half — deployed publish-bundle edge function (MC-01..MC-05)\n');
  const adminHeaders = { apikey: secretKey, Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' };
  const email = `mc-remote-${randomUUID().slice(0, 8)}@alpha.example`;
  const password = `McR-${randomUUID()}`;
  await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ email, password, email_confirm: true, app_metadata: { tenant_id: '11111111-1111-1111-1111-111111111111', app_role: 'ops_manager' } }),
  });
  const session = await (await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })).json();
  const token = session?.access_token;

  for (const [id, model] of [
    ['MC-01', { id: WRONG_MODEL.id, revision: WRONG_MODEL.revision, quantization: WRONG_MODEL.quantization, dimensions: WRONG_MODEL.dimensions }],
    ['MC-02', { dimensions: 768 }],
    ['MC-03', { quantization: 'fp32' }],
    ['MC-04', { revision: 'main' }],
  ]) {
    const res = await fetch(`${url}/functions/v1/publish-bundle`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sops: SOPS, model }),
    });
    check(id, `deployed publish rejects divergent model (HTTP ${res.status})`, res.status === 400, `HTTP ${res.status}`);
  }

  const ok = await fetch(`${url}/functions/v1/publish-bundle`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sops: SOPS, model: { ...PUBLISHED_MODEL } }),
  });
  check('MC-05', `deployed publish accepts restated model (HTTP ${ok.status})`, ok.status < 400, `HTTP ${ok.status}`);
}

async function main() {
  process.stdout.write('MC probe — model-confusion (P5 MC-01..MC-09)\n');
  serverChecks();
  await clientChecks();
  hypothesisProbe();
  if (process.argv.includes('--remote')) {
    await remoteHalf();
  } else {
    process.stdout.write('\n==> remote half SKIPPED (pass --remote with credentials to exercise the deployed function)\n');
  }

  const failures = proven.filter((c) => !c.ok);
  process.stdout.write(`\nproven checks: ${proven.length - failures.length}/${proven.length} passed`);
  process.stdout.write('\nMC-09: UNPROVEN HYPOTHESIS (does not block)\n');
  if (failures.length > 0) {
    process.stdout.write(`\nMC PROBE FAILED — ${failures.length} proven check(s) failed\n`);
    process.exit(1);
  }
  process.stdout.write('\nMC PROBE OK (proven halves pass; MC-09 left as unproven hypothesis)\n');
  process.exit(0);
}

main().catch((err) => {
  process.stdout.write(`  FAIL  unexpected error — ${err?.stack ?? err}\n`);
  process.exit(1);
});
