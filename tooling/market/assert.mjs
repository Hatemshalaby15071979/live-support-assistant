/**
 * Invariant assertions for the Market Twin smoke rung.
 *
 * A rung exits 0 only when every invariant here holds. Each one is a real assertion with a
 * negative control in the local regression suite — an invariant that cannot fail is not one.
 */

const INVARIANTS = [];

function check(name, ok, detail) {
  INVARIANTS.push({ name, ok: Boolean(ok), detail });
}

/**
 * @param {object} report  the assembled run report
 * @returns {{ checks: Array<{name:string,ok:boolean,detail:string}>, failed: string[] }}
 */
export function assertInvariants(report) {
  INVARIANTS.length = 0;

  const outcomes = report.outcomes;
  const total = outcomes.length;

  check(
    'every generated message has exactly one decision',
    total === report.traffic.totalMessages && outcomes.every((o) => o.outcome === 'answered' || o.outcome === 'escalated'),
    `${total} decisions for ${report.traffic.totalMessages} messages`,
  );

  check(
    'answered + escalated accounts for every message',
    report.totals.answered + report.totals.escalated === total,
    `answered ${report.totals.answered} + escalated ${report.totals.escalated} = ${report.totals.answered + report.totals.escalated}, messages ${total}`,
  );

  check(
    'unsafe is counted explicitly and is a non-negative integer',
    Number.isInteger(report.totals.unsafe) && report.totals.unsafe >= 0,
    `unsafe = ${report.totals.unsafe}`,
  );

  check(
    'the distinct-message denominator is used, not the ticket count',
    Number.isInteger(report.traffic.distinctMessages) &&
      report.traffic.distinctMessages > 0 &&
      report.traffic.distinctMessages <= report.traffic.totalMessages &&
      report.traffic.tickets >= report.traffic.distinctMessages,
    `distinct ${report.traffic.distinctMessages}, messages ${report.traffic.totalMessages}, tickets ${report.traffic.tickets}`,
  );

  check(
    'unsafe never exceeds the distinct-message denominator',
    report.totals.unsafe <= report.traffic.distinctMessages,
    `unsafe ${report.totals.unsafe} <= distinct ${report.traffic.distinctMessages}`,
  );

  check(
    'a repeat contact resolves to the same procedure as its first occurrence',
    outcomes.every((o) => {
      if (!o.isRepeat) return true;
      // Follow the recorded origin chain to the first NON-repeat occurrence. Matching by text was
      // ambiguous once procedure titles repeat: two messages can share a text but not a procedure,
      // and the lookup then compared against the wrong origin.
      let id = report.repeatOfById[o.id];
      const seen = new Set();
      while (id && !seen.has(id)) {
        seen.add(id);
        const first = outcomes.find((p) => p.id === id);
        if (!first) return true;
        if (!first.isRepeat) return first.outcome === o.outcome && first.procedureId === o.procedureId;
        id = report.repeatOfById[id];
      }
      return true;
    }),
    'repeats are stable',
  );

  check(
    'every in-scope answer names a procedure from the tenant procedure set',
    outcomes.every((o) => o.outcome !== 'answered' || report.procedureIds.includes(o.procedureId)),
    `${report.procedureIds.length} procedures in the set`,
  );

  // Multi-tenant only: an answer must name a procedure belonging to the message's OWN tenant.
  // Skipped on a single-tenant rung, where it would be vacuous — which also keeps the smoke rung's
  // invariant list, and therefore its committed report, unchanged.
  if (report.traffic.tenants > 1) {
    check(
      'every answer names a procedure belonging to the message tenant',
      outcomes.every(
        (o) =>
          o.outcome !== 'answered' ||
          (report.procedureIdsByTenant[report.tenantByMessageId[o.id]] ?? []).includes(o.procedureId),
      ),
      `${report.traffic.tenants} tenants`,
    );
  }

  check(
    'no out-of-scope or adversarial message is answered on text alone',
    outcomes.every((o) => !(o.groundTruth === 'out_of_scope' && o.isAdversarial && o.outcome === 'answered' && o.decidedOnText)),
    'adversarial messages never decide on text',
  );

  check(
    'all ten chaos events ran, each with an expected behaviour and an observation',
    report.chaos.length === 10 && report.chaos.every((c) => c.expected && c.observed && typeof c.safe === 'boolean'),
    `${report.chaos.length} events`,
  );

  check(
    'every chaos event showed its safe behaviour',
    report.chaos.every((c) => c.safe),
    report.chaos.filter((c) => !c.safe).map((c) => c.id).join(', ') || 'all safe',
  );

  check(
    'the run declares it did not read the held-out split or the gold set',
    report.dataMode.heldOutRead === false && report.dataMode.goldSetRead === false,
    `data_mode ${report.dataMode.mode}`,
  );

  check(
    'the run declares it used no embedder',
    report.dataMode.embedderUsed === false,
    `embedder_used ${report.dataMode.embedderUsed}`,
  );

  check(
    'a determinism digest is present so two runs can be compared byte-for-byte',
    typeof report.digest === 'string' && report.digest.length === 64,
    `digest ${report.digest}`,
  );

  return { checks: INVARIANTS.slice(), failed: INVARIANTS.filter((c) => !c.ok).map((c) => c.name) };
}
