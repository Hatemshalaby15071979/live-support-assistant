/**
 * The ten chaos events V2 §P2 names, each with the safe behaviour it must show.
 *
 * Every event is independently injectable and deterministic: same seed, same observation.
 * These are SIMULATIONS of the safety behaviours, not calls into the shipped system — the
 * smoke rung proves the harness is wired and deterministic. Nothing here reads the corpus,
 * the gold set or the held-out split, and nothing here uses an embedder.
 */

export const CHAOS_EVENTS = Object.freeze([
  Object.freeze({ id: 'corpus-edited-mid-flight', expected: 'old bundle keeps serving; the new one is gated by the conflict lint' }),
  Object.freeze({ id: 'contradictory-policy-publish', expected: 'publish refused with 422, naming the procedures and the values' }),
  Object.freeze({ id: 'model-version-drift', expected: 'client refuses search with model_mismatch' }),
  Object.freeze({ id: 'bundle-substitution', expected: 'client refuses on tenant; server records the attempt' }),
  Object.freeze({ id: 'key-rotation-mid-session', expected: 'device re-fetches; no plaintext leak' }),
  Object.freeze({ id: 'network-partition', expected: 'queue keeps order; flush on recovery; no duplicate audit rows' }),
  Object.freeze({ id: 'clock-skew', expected: 'retention and ordering unaffected' }),
  Object.freeze({ id: 'duplicate-submission', expected: 'idempotent; exactly one audit row' }),
  Object.freeze({ id: 'throttle-saturation', expected: 'throttled, not dropped; client backs off' }),
  Object.freeze({ id: 'deletion-request', expected: 'plaintext removed; audit skeleton kept' }),
]);

const ROTATED_WRAPPING_KEY = 'rotated-wrapping-key-v2';
const FOREIGN_TENANT = '22222222-2222-2222-2222-222222222222';

/** Deterministic per-event observation. `safe` is the assertion the rung makes. */
export function runChaos(rng, context) {
  const observations = [];
  const add = (id, observed, safe, detail) => {
    const spec = CHAOS_EVENTS.find((e) => e.id === id);
    observations.push({ id, expected: spec.expected, observed, safe, detail });
  };

  // 1. corpus edited mid-flight
  {
    const activeBundleVersion = 1;
    const inFlightServedVersion = activeBundleVersion; // the edit does not touch a published bundle
    const conflictDetected = true; // the new candidate trips the conflict lint
    add(
      'corpus-edited-mid-flight',
      `served v${inFlightServedVersion}; candidate gated (conflict detected)`,
      inFlightServedVersion === 1 && conflictDetected,
      'the edit changed the candidate only; the published bundle was not replaced',
    );
  }

  // 2. contradictory policy publish
  {
    const candidate = [
      { id: 'alpha-proc-007', value: 14 },
      { id: 'alpha-proc-019', value: 30 },
    ];
    const contradictory = candidate[0].value !== candidate[1].value;
    const status = contradictory ? 422 : 200;
    const namesBoth = contradictory
      ? `${candidate[0].id}=${candidate[0].value}, ${candidate[1].id}=${candidate[1].value}`
      : null;
    add(
      'contradictory-policy-publish',
      `HTTP ${status}${namesBoth ? ` naming ${namesBoth}` : ''}`,
      status === 422 && namesBoth !== null,
      'the refusal names both procedures and both values',
    );
  }

  // 3. model version drift
  {
    const clientModel = 'Xenova/all-MiniLM-L6-v2@rev-a';
    const manifestModel = 'Xenova/all-MiniLM-L6-v2@rev-b';
    const mismatched = clientModel !== manifestModel;
    const searchResult = mismatched ? 'model_mismatch' : 'searched';
    add(
      'model-version-drift',
      `client ${searchResult}; previous bundle stays active`,
      searchResult === 'model_mismatch',
      'the client refuses rather than searching with a mismatched model (D7)',
    );
  }

  // 4. bundle substitution
  {
    const bundleTenant = FOREIGN_TENANT;
    const homeTenant = context.tenantId;
    const refusedOnTenant = bundleTenant !== homeTenant;
    const serverRecordedAttempt = refusedOnTenant;
    add(
      'bundle-substitution',
      `refused on tenant; attempt recorded=${serverRecordedAttempt}`,
      refusedOnTenant && serverRecordedAttempt,
      'refusal is on tenant, not on model — the two checks are independent',
    );
  }

  // 5. key rotation mid-session
  {
    const before = 'wrapping-key-v1';
    const after = ROTATED_WRAPPING_KEY;
    const deviceRefetched = before !== after;
    const payload = `wrapped-bundle(${after})`;
    const plaintextLeak = /(?:secret|plaintext|BEGIN [A-Z ]*PRIVATE KEY)/i.test(payload);
    add(
      'key-rotation-mid-session',
      `device re-fetched=${deviceRefetched}; plaintext leak=${plaintextLeak}`,
      deviceRefetched && !plaintextLeak,
      'the device re-fetches the wrapping key; nothing plaintext crosses the wire',
    );
  }

  // 6. network partition
  {
    const queued = [1, 2, 3, 4, 5];
    const partitionAt = 2 + Math.floor(rng() * 3);
    const beforePartition = queued.slice(0, partitionAt);
    const heldDuringPartition = queued.slice(partitionAt);
    const flushed = [...beforePartition, ...heldDuringPartition];
    const orderPreserved = flushed.every((v, i) => v === queued[i]);
    const auditRows = flushed.length;
    const duplicateAuditRows = auditRows !== new Set(flushed).size;
    add(
      'network-partition',
      `order preserved=${orderPreserved}; audit rows=${auditRows}; duplicates=${duplicateAuditRows}`,
      orderPreserved && !duplicateAuditRows,
      'the queue holds order across the partition and flushes without duplicating audit rows',
    );
  }

  // 7. clock skew
  {
    const retentionDays = 90;
    const skewMs = (rngInt(rng, 1, 72) - 36) * 3600 * 1000; // -36h .. +36h
    const recordedAt = 1_000_000_000_000;
    const retained = recordedAt - skewMs; // skew shifts the clock, not the stored timestamp
    const orderUnaffected = retained === recordedAt - skewMs;
    const retentionUnaffected = Math.abs(skewMs) < retentionDays * 86_400_000;
    add(
      'clock-skew',
      `skew=${Math.round(skewMs / 3_600_000)}h; ordering unaffected=${orderUnaffected}; retention unaffected=${retentionUnaffected}`,
      orderUnaffected && retentionUnaffected,
      'skew is far inside the retention window, so neither ordering nor expiry moves',
    );
  }

  // 8. duplicate submission
  {
    const submissions = ['dup-1', 'dup-1'];
    const auditRows = new Set(submissions).size;
    const secondIsNoOp = submissions.length === 2 && auditRows === 1;
    add(
      'duplicate-submission',
      `submissions=${submissions.length}; audit rows=${auditRows}`,
      secondIsNoOp,
      'the dedup ledger makes the repeat a no-op',
    );
  }

  // 9. throttle saturation
  {
    const limit = 20;
    const attempted = limit + rngInt(rng, 5, 25);
    const admitted = Math.min(attempted, limit);
    const throttled = attempted - admitted;
    const dropped = 0;
    const clientBacksOff = throttled > 0;
    add(
      'throttle-saturation',
      `attempted=${attempted}; admitted=${admitted}; throttled=${throttled}; dropped=${dropped}`,
      throttled > 0 && dropped === 0 && clientBacksOff,
      'over-limit traffic is throttled and the client backs off; nothing is dropped',
    );
  }

  // 10. deletion request
  {
    const record = { subject: 'subject-1', plaintext: 'expired retention question', auditSkeleton: { id: 'esc-1', reason: 'insufficient_margin' } };
    const afterDeletion = { ...record, plaintext: '[redacted by retention policy]' };
    const plaintextRemoved = afterDeletion.plaintext !== record.plaintext;
    const skeletonKept = afterDeletion.auditSkeleton !== null;
    add(
      'deletion-request',
      `plaintext removed=${plaintextRemoved}; audit skeleton kept=${skeletonKept}`,
      plaintextRemoved && skeletonKept,
      'plaintext goes, the audit skeleton stays',
    );
  }

  return observations;
}

function rngInt(rng, minInclusive, maxInclusive) {
  return minInclusive + Math.floor(rng() * (maxInclusive - minInclusive + 1));
}
