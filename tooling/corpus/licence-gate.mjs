/**
 * The licence gate.
 *
 * Decides whether a source's terms permit the thing this project does with it:
 * store the text, split it into passages, summarise it, pair it with suggested
 * replies, and — where redistribution is permitted — commit the snapshot to a
 * public repository.
 *
 * The default is refusal. A licence id that is absent from the allowlist is
 * excluded, and so is a source that names no licence at all: absence of terms is
 * all rights reserved, which is the default in copyright, not a permission.
 *
 * The allowlist is data (`licence-allowlist.json`) rather than code so a
 * reviewer can read the whole policy in one place, and so adding a licence is a
 * reviewed diff rather than a change to a conditional.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** @typedef {{name: string, redistribute: boolean, attribution_required: boolean, share_alike?: boolean, url?: string, note?: string}} LicenceEntry */

/** Load and shape-check the allowlist. */
export function loadAllowlist(path = resolve(here, 'licence-allowlist.json')) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));

  if (parsed === null || typeof parsed !== 'object' || typeof parsed.allowed !== 'object') {
    throw new Error(`${path} has no "allowed" object`);
  }

  for (const [id, entry] of Object.entries(parsed.allowed)) {
    if (typeof entry.redistribute !== 'boolean' || typeof entry.attribution_required !== 'boolean') {
      throw new Error(`${path}: licence ${id} must declare redistribute and attribution_required as booleans`);
    }
  }

  return parsed;
}

/**
 * Decide whether a licence id may back a corpus.
 *
 * @param {unknown} licenceId The id a source declares. Anything that is not an
 *   allowlisted string is refused.
 * @param {ReturnType<typeof loadAllowlist>} [allowlist]
 * @returns {{allowed: true, id: string, entry: LicenceEntry}
 *          | {allowed: false, id: string | null, reason: string}}
 */
export function checkLicence(licenceId, allowlist = loadAllowlist()) {
  if (typeof licenceId !== 'string' || licenceId.trim() === '') {
    return {
      allowed: false,
      id: null,
      reason:
        'no licence is declared. An unstated licence is not a permissive one — the ' +
        'default in copyright is all rights reserved, so this is a refusal, not an ' +
        'item awaiting review.',
    };
  }

  const id = licenceId.trim();

  // Explicit exclusions first, by id. The short forms matter: `CC-BY-NC-4.0`
  // does not contain the string "NonCommercial", so a policy match on the long
  // form alone would let it fall through to the generic "not in the allowlist"
  // refusal. That still refuses it — but with a reason that does not say why,
  // and the next person to read the log learns nothing.
  if ((allowlist.excluded_ids ?? []).includes(id)) {
    const reason = id.includes('NC')
      ? 'NonCommercial: the product is commercial, and the restriction survives every downstream copy'
      : id.includes('ND')
        ? 'NoDerivatives: a procedure corpus is a derivative work by construction'
        : 'excluded by policy';
    return { allowed: false, id, reason: `"${id}" is excluded. ${reason}.` };
  }

  // Then the policy patterns, so a future NC/ND variant that nobody has listed
  // yet is still caught by name.
  for (const exclusion of allowlist.excluded_by_policy ?? []) {
    if (id.toLowerCase().includes(exclusion.match.toLowerCase())) {
      return { allowed: false, id, reason: exclusion.reason };
    }
  }

  const entry = allowlist.allowed[id];

  if (entry === undefined) {
    return {
      allowed: false,
      id,
      reason:
        `"${id}" is not in the allowlist. The list is a refusal-by-default: a licence ` +
        'is permitted because someone added it and said why, not because it was ' +
        'not excluded.',
    };
  }

  return { allowed: true, id, entry };
}

/**
 * What may be committed to the repository for a source.
 *
 * The distinction matters and is easy to lose: a licence can permit *use* while
 * making *redistribution* awkward, and this repository is public. Where
 * redistribution is not permitted, the snapshot stays local and only the hash,
 * the fetch script and the attribution record are committed — so the corpus is
 * reproducible without being republished.
 *
 * @param {LicenceEntry} entry
 * @returns {{commitText: boolean, reason: string}}
 */
export function redistributionPolicy(entry) {
  if (entry.redistribute !== true) {
    return {
      commitText: false,
      reason: 'the licence does not permit redistribution, so only the hash and fetch script are committed',
    };
  }

  if (entry.share_alike === true) {
    return {
      commitText: true,
      reason: 'redistribution permitted; ShareAlike means the derived corpus must carry the same licence, recorded in its attribution file',
    };
  }

  return {
    commitText: true,
    reason: entry.attribution_required
      ? 'redistribution permitted with attribution; the attribution file is required for the corpus to be publishable'
      : 'redistribution permitted without attribution',
  };
}
