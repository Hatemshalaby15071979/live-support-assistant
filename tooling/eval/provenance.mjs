/**
 * Git provenance for an evaluation report.
 *
 * Why this exists: neither deployed run in this repository records the commit it
 * was taken against (`phase5-deployed-run-0aec9773442c4282` and
 * `phase5-deployed-run-60cdbbea8a4f478f` both omit the build SHA), so a headline
 * number cannot be traced to the code that produced it. That is a reproducibility
 * gap, not a formatting one — a result nobody can tie to a revision is an anecdote.
 *
 * One implementation rather than one per driver. Every report writer calls
 * `gitProvenance(root)` and spreads the result into its report; a driver that
 * forgets to is a driver whose numbers are untraceable, so the shape is kept
 * deliberately small and the call deliberately cheap.
 *
 * Failure is a value, not an exception. A report written outside a git checkout —
 * a tarball, a CI artifact, a detached export — must still be produced, with the
 * absence recorded rather than the run refused.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * @typedef {object} Provenance
 * @property {string | null} commit Full 40-character SHA, or null when unavailable.
 * @property {string | null} branch Branch name, or `HEAD` when detached.
 * @property {boolean | null} dirty Whether the working tree had uncommitted changes.
 * @property {number | null} dirtyFiles Count of changed paths, when dirty.
 * @property {string | null} note Set only when provenance could not be read.
 */

async function git(args, cwd) {
  try {
    const { stdout } = await run('git', args, { cwd, windowsHide: true });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Read the commit, branch and working-tree state for a directory.
 *
 * @param {string} cwd Repository root. Defaults to the process working directory.
 * @returns {Promise<Provenance>}
 */
export async function gitProvenance(cwd = process.cwd()) {
  const commit = await git(['rev-parse', 'HEAD'], cwd);

  if (commit === null) {
    return {
      commit: null,
      branch: null,
      dirty: null,
      dirtyFiles: null,
      note: 'not a git checkout, or git is unavailable',
    };
  }

  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  const status = await git(['status', '--porcelain'], cwd);
  const changed = status === null || status === '' ? [] : status.split('\n');

  return {
    commit,
    branch,
    dirty: status === null ? null : changed.length > 0,
    dirtyFiles: status === null ? null : changed.length,
    note: null,
    // A run taken with uncommitted changes is still a real measurement, but it is
    // not reproducible from the commit alone. Recording the count lets a reader
    // see that without having to guess, and the report says so in one line.
    ...(changed.length > 0
      ? { caveat: `${changed.length} uncommitted path(s) present when this report was written` }
      : {}),
  };
}

/** A single line for a Markdown report. */
export function provenanceLine(provenance) {
  if (provenance.commit === null) {
    return `**Provenance:** ${provenance.note}`;
  }

  const short = provenance.commit.slice(0, 12);
  const state = provenance.dirty === true
    ? `working tree dirty (${provenance.dirtyFiles} path(s))`
    : 'working tree clean';

  return `**Provenance:** commit \`${short}\` on \`${provenance.branch}\`, ${state}.`;
}
