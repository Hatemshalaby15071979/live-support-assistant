#!/usr/bin/env node
/**
 * verify-history-secret-scanner.mjs — executable negative controls for the history scanner.
 *
 * Why: a scanner that exits 0 proves nothing unless you have watched it fail. This suite builds
 * disposable temporary Git repositories, plants synthetic (non-functional) credential-shaped
 * values, and asserts every credential shape remains a hard hit. Triage metadata never suppresses.
 *
 * Fixtures: every repository is created under os.tmpdir()/lss-scanner-tests-<pid>/ and removed
 * at the end. The real repository and any hosted service are never used as a fixture, and no
 * usable credential is created anywhere: every planted value is derived from a SHA-256 of a
 * label, so it cannot collide with a real secret.
 *
 * Usage: node tooling/security/verify-history-secret-scanner.mjs
 * Exit: 0 = every control passed · 1 = at least one control failed.
 */

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import { walkDiff, audit, normalizeAndHash, loadExceptions, validateTriageRegistry, CATEGORIES, classify } from './scan-history-secrets.mjs';

const SCANNER = new URL('./scan-history-secrets.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const ROOT = process.cwd();

/** Deterministic synthetic value: can never equal a real credential. */
function synth(label, n) {
  let h = label;
  let out = '';
  while (out.length < n) {
    h = createHash('sha256').update(h, 'utf8').digest('hex');
    out += h;
  }
  return out.slice(0, n);
}

const RESULTS = [];

function record(name, expected, ok, detail) {
  RESULTS.push({ name, expected, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  console.log(`      expected: ${expected}`);
  console.log(`      actual:   ${detail}`);
}

function run(cmd, args, cwd) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, windowsHide: true });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { out += d.toString('utf8'); });
    p.stderr.on('data', (d) => { err += d.toString('utf8'); });
    p.on('error', (e) => { err += e.message; resolve({ code: 127, out, err }); });
    p.on('close', (code) => resolve({ code, out, err }));
  });
}

const git = (args, cwd) => run('git', args, cwd);

const TMP_ROOT = join(tmpdir(), `lss-scanner-tests-${process.pid}`);
mkdirSync(TMP_ROOT, { recursive: true });

async function newRepo(tag) {
  const dir = join(TMP_ROOT, tag);
  mkdirSync(dir, { recursive: true });
  const r = await git(['init', '-q', dir], dir);
  if (r.code !== 0) throw new Error(`git init failed in ${dir}`);
  await git(['config', 'user.email', 'scanner-test@example.invalid'], dir);
  await git(['config', 'user.name', 'Scanner Test'], dir);
  await git(['config', 'commit.gpgsign', 'false'], dir);
  const registryPath = join(dir, 'tooling/security/history-scan-exceptions.json');
  mkdirSync(join(registryPath, '..'), { recursive: true });
  writeFileSync(registryPath, JSON.stringify({ version: 2, entries: [] }, null, 2));
  return dir;
}

async function commitFile(dir, relPath, content, message) {
  const full = join(dir, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf8');
  await git(['add', relPath], dir);
  const r = await git(['commit', '-q', '-m', message], dir);
  if (r.code !== 0) throw new Error(`commit failed: ${r.err}`);
  return (await git(['rev-parse', 'HEAD'], dir)).out.trim();
}

async function scanFixture(dir, extraArgs = []) {
  return run(process.execPath, [SCANNER, ...extraArgs], dir);
}

function writeRegistry(dir, entries) {
  const p = join(dir, 'tooling/security/history-scan-exceptions.json');
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, JSON.stringify({ version: 2, entries }, null, 2));
  return p;
}

async function commitBytes(dir, relPath, content, message) {
  const full = join(dir, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content);
  await git(['add', relPath], dir);
  const r = await git(['commit', '-q', '-m', message], dir);
  if (r.code !== 0) throw new Error(`commit failed: ${r.err}`);
  return (await git(['rev-parse', 'HEAD'], dir)).out.trim();
}

// The exact reviewed documentation line, reproduced byte-for-byte from the real history so the
// registry's content identity can be checked. It is CONSTRUCTED, not written as one literal:
// the committed source of this suite must not itself contain a credential-shaped string
// (see the note at PLANT). The runtime bytes are identical to the historical line.
const REVIEWED_LINE = `| credential-url (\`scheme${'://'}user${':'}pass${'@'}\`) | 0 | clean |`;

// Synthetic planted values. None is a usable credential.
//
// IMPORTANT: these are CONSTRUCTED, never written as a contiguous literal. The committed
// source of a scanner's own test suite must not itself contain credential-shaped strings —
// a scanner that needs a suppression for its own fixtures has a hole in exactly the place this
// suite exists to protect. `git log -p` of this file therefore contains no private-key header
// and no inline user:password URL; the fixtures written into the temporary repositories still
// carry the full shape, and it is those that the scanner must catch.
const SCHEME = 'http' + 's://';
const KEY_TAG = 'EXAMPLE TEST ';
const URL_HOST = 'github' + '.com/owner/repo';
const URL_HOST_2 = 'api.' + 'github.com/v3/repos';
const PLANT = {
  aws: `AKIA${synth('aws-key', 16).toUpperCase()}`,
  google: `AIza${synth('google-key', 35)}`,
  supabase: `sb_secret_${synth('supabase-key', 24)}`,
  jwt: `eyJ${synth('jwt-a', 10)}.${synth('jwt-b', 10)}.${synth('jwt-c', 20)}`,
  urlPass: `${SCHEME}pass:${synth('urlpass', 18)}@${URL_HOST}`,
  urlToken: `${SCHEME}svc:token@${URL_HOST_2}`,
};

/** Build a fixture with one registered exact occurrence plus one near-miss occurrence. */
async function nearMissRepo(tag, nearMiss) {
  const dir = await newRepo(tag);
  const registeredPath = 'docs/program/p0-evidence-2026-10-12.md';
  const registeredSha = await commitFile(dir, registeredPath, `${REVIEWED_LINE}\n`, 'docs: reviewed placeholder line');
  const nearSha = await commitFile(dir, nearMiss.path, nearMiss.content, 'docs: near-miss line');
  const registry = writeRegistry(dir, [{
    id: 'EXC-TEST-REG', commit: registeredSha, path: registeredPath,
    op: 'added', category: 'credential-url', lineSha256: normalizeAndHash(REVIEWED_LINE),
    disposition: 'synthetic documentation fixture, retained as a hard hit',
    reviewedBy: 'reviewer-one', approvedBy: 'reviewer-two', reviewedAt: '2026-11-08',
  }]);
  return { dir, registry, registeredSha, nearSha };
}

async function main() {
  try {
    // ---- 0. strict hard-hit policy and empty in-repository triage registry -----
    {
      const registry = loadExceptions(join(ROOT, 'tooling/security/history-scan-exceptions.json'));
      record('all-categories-hard-and-registry-empty',
        'all detector categories are hard and the pinned registry starts empty',
        CATEGORIES.length >= 14 && CATEGORIES.every((c) => c.hard) && registry.length === 0,
        `categories=${CATEGORIES.length}; hard=${CATEGORIES.filter((c) => c.hard).length}; entries=${registry.length}`);
      const emailCategory = CATEGORIES.find((c) => c.id === 'email-address');
      const reserved = classify('contact@example.invalid', emailCategory);
      const personal = classify(['user','@','gmail.com'].join(''), emailCategory);
      record('reserved-email-domains-only-are-safe-fixtures',
        'reserved example/test domains are annotated safe; real consumer email domains remain hard hits',
        reserved?.hard === false && personal?.hard === true,
        `reserved=${reserved?.hard}; consumer_domain=${personal?.hard}`);
    }

    // ---- 1. reviewed historical occurrence remains a hard hit -------
    {
      const dir = await newRepo('approved');
      const sha = await commitFile(dir, 'docs/program/p0-evidence-2026-10-12.md', `${REVIEWED_LINE}\n`, 'docs: reviewed placeholder line');
      writeRegistry(dir, [{
        id: 'EXC-TEST-001', commit: sha, path: 'docs/program/p0-evidence-2026-10-12.md',
        op: 'added', category: 'credential-url', lineSha256: normalizeAndHash(REVIEWED_LINE),
        disposition: 'synthetic documentation fixture, retained as a hard hit',
        reviewedBy: 'reviewer-one', approvedBy: 'reviewer-two', reviewedAt: '2026-11-08',
      }]);
      const r = await scanFixture(dir);
      const applied = r.out.includes('TRIAGE RECORDS MATCHED') && r.out.includes('EXC-TEST-001') && r.out.includes('(still hard)');
      record('two-person-triage-never-exempts',
        'exit 1 and the exact occurrence is visibly triaged while remaining a hard hit',
        r.code === 1 && applied && /credential-url\s+1\s+HARD-HIT 1/.test(r.out),
        `exit ${r.code}; triage=${applied}; ${(r.out.match(/credential-url\s+\d+\s+\S*/) || ['<no line>'])[0]}`);
    }

    // ---- 2. modified occurrence: one character changed ------------------------
    {
      const from = `scheme${'://'}user${':'}pass${'@'}`;
      const to = `scheme${'://'}user${':'}passX${'@'}`;
      const modified = REVIEWED_LINE.replace(from, to);
      const { dir, registry } = await nearMissRepo('modified', { path: 'docs/b.md', content: `${modified}\n` });
      const r = await scanFixture(dir);
      record('modified-occurrence-fails',
        'exit 1 with two credential-url HARD-HITs; even the exact triaged occurrence remains hard',
        r.code === 1 && /credential-url\s+2\s+HARD-HIT 2/.test(r.out) && r.out.includes('EXC-TEST-REG'),
        `exit ${r.code}; ${(r.out.match(/credential-url\s+\d+\s+\S+/) || [''])[0]}; triage record matched=${r.out.includes('EXC-TEST-REG')}`);
    }

    // ---- 3. wrong file ---------------------------------------------------------
    {
      const { dir, registry } = await nearMissRepo('wrongfile', { path: 'docs/elsewhere.md', content: `${REVIEWED_LINE}\n` });
      const r = await scanFixture(dir);
      record('wrong-file-fails',
        'exit 1 with two credential-url HARD-HITs; a different path receives no triage record',
        r.code === 1 && /credential-url\s+2\s+HARD-HIT 2/.test(r.out) && r.out.includes('EXC-TEST-REG'),
        `exit ${r.code}; ${(r.out.match(/credential-url\s+\d+\s+\S+/) || [''])[0]}; triage record matched=${r.out.includes('EXC-TEST-REG')}`);
    }

    // ---- 4. wrong commit -------------------------------------------------------
    {
      const { dir, registry } = await nearMissRepo('wrongcommit', { path: 'docs/program/p0-evidence-2026-10-12.md', content: `${REVIEWED_LINE}\n${REVIEWED_LINE}\n` });
      const r = await scanFixture(dir);
      record('wrong-commit-fails',
        'exit 1 with two credential-url HARD-HITs; a different commit receives no triage record',
        r.code === 1 && /credential-url\s+2\s+HARD-HIT 2/.test(r.out) && r.out.includes('EXC-TEST-REG'),
        `exit ${r.code}; ${(r.out.match(/credential-url\s+\d+\s+\S+/) || [''])[0]}; triage record matched=${r.out.includes('EXC-TEST-REG')}`);
    }

    // ---- 5/6. credential URLs using `pass` and `token` against real hosts ------
    {
      const dir = await newRepo('credtoken');
      await commitFile(dir, 'docs/deploy.md', `url = ${PLANT.urlPass}\nbackup = ${PLANT.urlToken}\n`, 'docs: deploy urls');
      const r = await scanFixture(dir);
      record('credential-url-with-pass-and-token-fails',
        'exit 1: a URL whose user or password atom is literally `pass`/`token` against a real host is a hard hit (generic exemption removed)',
        r.code === 1 && /credential-url\s+2\s+HARD-HIT 2/.test(r.out),
        `exit ${r.code}; ${(r.out.match(/credential-url\s+\d+\s+\S+/) || [''])[0]}`);
    }

    // ---- 7. API-key patterns ---------------------------------------------------
    {
      const dir = await newRepo('apikeys');
      await commitFile(dir, 'fixtures/keys.txt',
        `AWS_ACCESS_KEY_ID=${PLANT.aws}\nGOOGLE_KEY=${PLANT.google}\nSUPABASE_KEY=${PLANT.supabase}\n`, 'test: key-shaped fixtures');
      const r = await scanFixture(dir);
      record('api-key-patterns-fail',
        'exit 1: each supported hard detector (AWS, Google, Supabase) fires on synthetic key shapes',
        r.code === 1
          && /aws-access-key\s+1\s+HARD-HIT 1/.test(r.out)
          && /google-api-key\s+1\s+HARD-HIT 1/.test(r.out)
          && /supabase-secret-key\s+1\s+HARD-HIT 1/.test(r.out),
        `exit ${r.code}; ${(r.out.match(/aws-access-key\s+\d+\s+\S+/) || [''])[0]} / ${(r.out.match(/google-api-key\s+\d+\s+\S+/) || [''])[0]} / ${(r.out.match(/supabase-secret-key\s+\d+\s+\S+/) || [''])[0]}`);
    }

    // ---- 8. JWT-shaped value ---------------------------------------------------
    {
      const dir = await newRepo('jwt');
      await commitFile(dir, 'fixtures/token.txt', `token = ${PLANT.jwt}\n`, 'test: jwt-shaped fixture');
      const r = await scanFixture(dir);
      record('jwt-shape-fails',
        'exit 1: a JWT-shaped value is a hard hit',
        r.code === 1 && /jwt-shape\s+1\s+HARD-HIT 1/.test(r.out),
        `exit ${r.code}; ${(r.out.match(/jwt-shape\s+\d+\s+\S+/) || [''])[0]}`);
    }

    // ---- 9. private-key block --------------------------------------------------
    {
      const dir = await newRepo('pkey');
      // Constructed the same way: header and footer never appear as one literal in this source.
      const head = '-----' + 'BEGIN ' + KEY_TAG + 'PRIVATE KEY-----';
      const foot = '-----' + 'END ' + KEY_TAG + 'PRIVATE KEY-----';
      const fake = `${head}\n${synth('keybody', 64)}\n${synth('keybody2', 64)}\n${foot}\n`;
      await commitFile(dir, 'fixtures/id_example', fake, 'test: nonfunctional key block');
      const r = await scanFixture(dir);
      record('private-key-block-fails',
        'exit 1: a private-key header/footer block is a hard hit',
        r.code === 1 && /private-key-block\s+1\s+HARD-HIT 1/.test(r.out),
        `exit ${r.code}; ${(r.out.match(/private-key-block\s+\d+\s+\S+/) || [''])[0]}`);
    }

    // ---- 10. redaction across stdout, stderr and JSON --------------------------
    {
      const dir = await newRepo('redaction');
      await commitFile(dir, 'fixtures/all.txt',
        `a=${PLANT.aws}\nb=${PLANT.google}\nc=${PLANT.supabase}\nd=${PLANT.jwt}\ne=${PLANT.urlPass}\nf=${PLANT.urlToken}\n`, 'test: every shape');
      const jsonPath = join(TMP_ROOT, 'redaction-report.json');
      const r = await scanFixture(dir, ['--json', jsonPath]);
      const jsonText = existsSync(jsonPath) ? readFileSync(jsonPath, 'utf8') : '{}';
      const planted = Object.values(PLANT);
      const leaked = planted.filter((v) => r.out.includes(v) || r.err.includes(v) || jsonText.includes(v));
      record('no-leak-in-output',
        'stdout, stderr and JSON must contain none of the planted values',
        leaked.length === 0,
        leaked.length === 0
          ? `exit ${r.code}; no planted value in ${r.out.length + r.err.length} chars of stdout/stderr or ${jsonText.length} chars of JSON`
          : `LEAKED: ${leaked.map((v) => v.slice(0, 6) + '…').join(', ')}`);
    }

    // ---- 11. added and removed events are both inspected -----------------------
    {
      const dir = await newRepo('addremove');
      await commitFile(dir, 'fixtures/key.txt', `key=${PLANT.aws}\n`, 'test: add key fixture');
      await commitFile(dir, 'fixtures/key.txt', 'key=removed\n', 'test: remove key fixture');
      const jsonPath = join(TMP_ROOT, 'addremove-report.json');
      const r = await scanFixture(dir, ['--json', jsonPath]);
      const report = JSON.parse(readFileSync(jsonPath, 'utf8'));
      const aws = report.counts['aws-access-key'];
      const ops = new Set(report.details['aws-access-key'].map((d) => (d.includes(' added ') ? 'added' : 'removed')));
      record('added-and-removed-events-inspected',
        'both the addition and the removal of the same content are inspected (count >= 2, both ops present)',
        aws >= 2 && ops.has('added') && ops.has('removed'),
        `aws-access-key count=${aws}, ops seen=${[...ops].join(',')}`);
    }

    // ---- 12a. subprocess failure is not a clean scan (CLI) ---------------------
    {
      const dir = await newRepo('gitfail');
      await commitFile(dir, 'README.md', 'clean\n', 'chore: seed');
      const r = await scanFixture(dir, ['--git', join(TMP_ROOT, 'no-such-git-binary')]);
      record('subprocess-failure-fails-closed',
        'exit 2 and a "DID NOT COMPLETE" message when git cannot be spawned',
        r.code === 2 && /DID NOT COMPLETE/.test(r.out + r.err),
        `exit ${r.code}; message=${(r.out + r.err).match(/DID NOT COMPLETE[^\n]*/) || ['<none>']}`);
    }

    // ---- 12b. truncated diff, non-zero git exit, stale registry ----------------
    {
      const gitFail = () => Promise.resolve({ code: 1, out: '', err: 'fatal: bad revision' });
      const walkBad = await walkDiff({ rev: 'nope', gitRun: gitFail });
      const badExit = audit({ walk: walkBad, expectedCommits: [], exceptions: [] });
      record('git-nonzero-exit-fails-closed', 'audit() reports not-ok with a git-exit reason',
        badExit.ok === false && badExit.reasons.some((r) => /git exited/.test(r)),
        `ok=${badExit.ok}; reasons=${JSON.stringify(badExit.reasons)}`);

      const gitTrunc = () => Promise.resolve({ code: 0, out: '@@@aaaa\n+dummy\n', err: '' });
      const walkTrunc = await walkDiff({ rev: 'HEAD', gitRun: gitTrunc });
      const trunc = audit({ walk: walkTrunc, expectedCommits: ['aaaa', 'bbbb'], exceptions: [] });
      record('incomplete-diff-fails-closed',
        'audit() reports not-ok when a commit from rev-list produced no diff',
        trunc.ok === false && trunc.reasons.some((r) => /produced no diff/.test(r)),
        `ok=${trunc.ok}; reasons=${JSON.stringify(trunc.reasons)}`);

      const staleRegistry = [{ id: 'EXC-STALE', commit: '0'.repeat(40), path: 'nope', op: 'added', lineSha256: 'f'.repeat(64), disposition: 'x' }];
      const gitEmpty = () => Promise.resolve({ code: 0, out: '', err: '' });
      const walkEmpty = await walkDiff({ rev: 'HEAD', gitRun: gitEmpty });
      const staleCheck = audit({ walk: walkEmpty, expectedCommits: [], exceptions: staleRegistry });
      record('stale-exception-fails-closed', 'audit() reports not-ok when a registry entry matches nothing',
        staleCheck.ok === false && staleCheck.reasons.some((r) => /stale/.test(r)),
        `ok=${staleCheck.ok}; reasons=${JSON.stringify(staleCheck.reasons)}`);
    }

    // ---- 13. negative control: the detector really can fire --------------------
    {
      const dir = await newRepo('negcontrol');
      await commitFile(dir, 'docs/deploy.md', `primary = ${PLANT.urlPass}\n`, 'docs: near-real url');
      const r = await scanFixture(dir);
      record('detector-negative-control',
        'exit 1 with a credential-url HARD-HIT — proves the detector fires rather than crashing',
        r.code === 1 && /credential-url\s+1\s+HARD-HIT 1/.test(r.out),
        `exit ${r.code}; ${(r.out.match(/credential-url\s+\d+\s+\S+/) || [''])[0]}`);
    }

    // ---- 14. hunk lines whose own content starts with ++ or -- are not skipped -
    {
      const dir = await newRepo('plusline');
      const url = `${SCHEME}${synth('plus-user', 8)}:${synth('plus-pass', 14)}@${URL_HOST}`;
      await commitFile(dir, 'docs/note.md', `++${url}\n`, 'docs: line starting with plusplus');
      const r = await scanFixture(dir);
      record('content-lines-starting-with-plusplus-are-scanned',
        'exit 1: a changed line whose own text begins with "++" must not be mistaken for a diff header and skipped',
        r.code === 1 && /credential-url\s+1\s+HARD-HIT 1/.test(r.out),
        `exit ${r.code}; ${(r.out.match(/credential-url\s+\d+\s+\S+/) || [''])[0]}`);
    }

    // ---- 15. all refs are scanned, not only the checked-out branch ------------
    {
      const dir = await newRepo('allrefs');
      await commitFile(dir, 'README.md', 'clean\n', 'chore: seed');
      await git(['checkout', '-q', '-b', 'side'], dir);
      const token = `sk-${synth('side-branch-key', 20)}`;
      await commitFile(dir, 'docs/branch.txt', `token = ${token}\n`, 'docs: secondary branch fixture');
      await git(['checkout', '-q', '-'], dir);
      const r = await scanFixture(dir);
      record('all-refs-are-scanned', 'a token reachable only from a non-checked-out branch is a hard hit',
        r.code === 1 && /openai-api-key\s+1\s+HARD-HIT 1/.test(r.out),
        `exit ${r.code}; ${(r.out.match(/openai-api-key\s+\d+\s+\S+/) || ['<no line>'])[0]}`);
    }

    // ---- 16. provider token and high-entropy detectors ------------------------
    {
      const dir = await newRepo('token-families');
      const contents = [
        `openai=${`sk-${synth('openai-key', 20)}`}`,
        `github=${`ghp_${synth('github-key', 24)}`}`,
        `slack=${`xoxb-${synth('slack-key', 24)}`}`,
        `api_key="${synth('high-entropy', 48)}"`,
      ].join('\n') + '\n';
      await commitFile(dir, 'fixtures/provider-tokens.txt', contents, 'test: provider token families');
      const r = await scanFixture(dir);
      const ok = r.code === 1 && /openai-api-key\s+1\s+HARD-HIT 1/.test(r.out)
        && /github-token\s+1\s+HARD-HIT 1/.test(r.out)
        && /slack-token\s+1\s+HARD-HIT 1/.test(r.out)
        && /high-entropy-assignment\s+1\s+HARD-HIT 1/.test(r.out);
      record('provider-and-high-entropy-detectors', 'sk-, ghp_, xox-, and high-entropy assignments are hard hits', ok,
        `exit ${r.code}; provider rules=${['openai-api-key','github-token','slack-token','high-entropy-assignment'].filter((x) => r.out.includes(x)).join(',')}`);
    }

    // ---- 17. unreachable binary objects are scanned ---------------------------
    {
      const dir = await newRepo('unreachable-binary');
      await commitFile(dir, 'README.md', 'clean\n', 'chore: seed');
      await git(['checkout', '-q', '-b', 'unreachable-fixture'], dir);
      const bytes = Buffer.concat([Buffer.from([0, 255, 1]), Buffer.from(`ghp_${synth('unreachable-token', 24)}`), Buffer.from([0, 10])]);
      await commitBytes(dir, 'fixtures/archive.bin', bytes, 'test: unreachable binary fixture');
      await git(['checkout', '-q', '-'], dir);
      await git(['branch', '-D', 'unreachable-fixture'], dir);
      const r = await scanFixture(dir);
      record('unreachable-binary-object-is-scanned', 'an unreachable binary Git blob remains visible as a hard hit',
        r.code === 1 && /stored-object blob [0-9a-f]{12} github-token HARD-HIT/.test(r.out),
        `exit ${r.code}; stored-object hit=${/stored-object blob [0-9a-f]{12} github-token HARD-HIT/.test(r.out)}`);
    }

    // ---- 18. exception path is pinned -----------------------------------------
    {
      const dir = await newRepo('registry-path');
      await commitFile(dir, 'README.md', 'clean\n', 'chore: seed');
      const external = join(TMP_ROOT, 'outside-registry.json');
      writeFileSync(external, JSON.stringify({ version: 2, entries: [] }));
      const r = await scanFixture(dir, ['--exceptions', external]);
      record('triage-registry-path-pinned', 'caller-supplied registry files fail closed',
        r.code === 2 && /registry path are pinned/.test(r.out + r.err), `exit ${r.code}`);
    }

    // ---- 19. tooling exemptions are forbidden -------------------------------
    {
      const entry = { id:'EXC-TOOL', commit:'a'.repeat(40), path:'tooling/security/scan.mjs', op:'added', lineSha256:'b'.repeat(64), disposition:'review', reviewedBy:'reviewer-one', approvedBy:'reviewer-two', reviewedAt:'2026-11-08' };
      const errors = validateTriageRegistry([entry]);
      record('tooling-triage-entry-rejected', 'triage entries cannot point into tooling/', errors.some((x) => /may not point into tooling/.test(x)), `errors=${errors.length}`);
    }

    // ---- 20. two distinct human logins are mandatory -------------------------
    {
      const entry = { id:'EXC-SAME', commit:'a'.repeat(40), path:'docs/note.md', op:'added', lineSha256:'b'.repeat(64), disposition:'review', reviewedBy:'reviewer-one', approvedBy:'reviewer-one', reviewedAt:'2026-11-08' };
      const errors = validateTriageRegistry([entry]);
      const agent = { ...entry, id:'EXC-AGENT', reviewedBy:'engineering-agent', approvedBy:'reviewer-two' };
      const agentErrors = validateTriageRegistry([agent]);
      record('two-person-human-triage-required', 'duplicate reviewer identities and agent identities fail closed',
        errors.some((x) => /two distinct human GitHub login/.test(x)) && agentErrors.some((x) => /two distinct human GitHub login/.test(x)),
        `duplicate_errors=${errors.length}; agent_identity_errors=${agentErrors.length}`);
    }
  } finally {
    try { rmSync(TMP_ROOT, { recursive: true, force: true, maxRetries: 3 }); } catch { /* leave for the OS */ }
  }

  const failed = RESULTS.filter((r) => !r.ok);
  console.log('');
  console.log(`controls: ${RESULTS.length}   passed: ${RESULTS.length - failed.length}   failed: ${failed.length}`);
  if (failed.length > 0) {
    console.log('FAILED CONTROLS:');
    for (const f of failed) console.log(`    ${f.name}`);
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`test harness error: ${err.stack || err.message}`);
  process.exit(2);
});
