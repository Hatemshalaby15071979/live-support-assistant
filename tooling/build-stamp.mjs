#!/usr/bin/env node
/**
 * Build identity stamp (V2 build hygiene).
 *
 * Writes a small JSON artifact describing the exact build provenance so the running
 * app can report which commit, branch and time produced it. This is the
 * "build-identity stamp" deliverable.
 *
 *   node tooling/build-stamp.mjs
 *
 * Output: apps/web/public/build-identity.json
 *
 * The git HEAD sha is read directly from .git (no child process) following the same
 * technique as tooling/market/run-market.mjs, because spawning git is unreliable on
 * this host. The dirty flag is best-effort via a guarded spawnSync.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Resolve { sha, branch } straight from .git, including linked worktrees. */
function readHead() {
  const gitEntry = resolve(ROOT, '.git');
  if (!existsSync(gitEntry)) return { sha: 'unknown', branch: 'unknown' };

  // A normal checkout has a .git directory. A linked worktree has a .git file
  // pointing at git/worktrees/<name>; the branch refs live in its common dir.
  const gitDir = statSync(gitEntry).isDirectory()
    ? gitEntry
    : resolve(ROOT, readFileSync(gitEntry, 'utf8').trim().replace(/^gitdir:\s*/, ''));
  if (!existsSync(gitDir)) return { sha: 'unknown', branch: 'unknown' };

  const commonDirFile = resolve(gitDir, 'commondir');
  const commonDir = existsSync(commonDirFile)
    ? resolve(gitDir, readFileSync(commonDirFile, 'utf8').trim())
    : gitDir;
  const headPath = resolve(gitDir, 'HEAD');
  if (!existsSync(headPath)) return { sha: 'unknown', branch: 'unknown' };
  const head = readFileSync(headPath, 'utf8').trim();
  if (!head.startsWith('ref:')) return { sha: head.slice(0, 12), branch: '(detached)' };

  const ref = head.slice('ref:'.length).trim();
  const loosePaths = [resolve(gitDir, ref), resolve(commonDir, ref)];
  const looseRef = loosePaths.find((path) => existsSync(path));
  let sha = looseRef ? readFileSync(looseRef, 'utf8').trim() : '';

  // A packed branch ref has no loose file; consult packed-refs in the common dir.
  const packedRefsPath = resolve(commonDir, 'packed-refs');
  if (sha === '' && existsSync(packedRefsPath)) {
    const packedLine = readFileSync(packedRefsPath, 'utf8')
      .split(/\r?\n/)
      .find((line) => !line.startsWith('#') && !line.startsWith('^') && line.endsWith(` ${ref}`));
    sha = packedLine?.split(' ')[0] ?? '';
  }

  const branch = ref.replace(/^refs\/heads\//, '');
  return { sha: sha === '' ? 'unknown' : sha.slice(0, 12), branch };
}

/** Best-effort working-tree dirty check. Returns true / false / 'unknown'. */
function isDirty() {
  try {
    const res = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, timeout: 5000 });
    if (res.status !== 0) return 'unknown';
    return res.stdout.toString().trim().length > 0;
  } catch {
    return 'unknown';
  }
}

const { sha, branch } = readHead();
const stamp = {
  project: 'sop-escalation-engine',
  sha,
  shortSha: sha.slice(0, 7),
  branch,
  dirty: isDirty(),
  builtAt: new Date().toISOString(),
};

const outDir = resolve(ROOT, 'apps/web/public');
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, 'build-identity.json');
writeFileSync(outPath, JSON.stringify(stamp, null, 2) + '\n', 'utf8');
process.stdout.write(`build-identity stamp written: ${outPath}\n  ${JSON.stringify(stamp)}\n`);
