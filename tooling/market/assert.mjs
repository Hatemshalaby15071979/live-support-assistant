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
      const first = outcomes.find((p) => p.text === o.text && !p.isRepeat);
      if (!first) return true;
      return first.outcome === o.outcome && first.procedureId === o.procedureId;
    }),
    'repeats are stable',
  );

  check(
    'every in-scope answer names a procedure from the tenant procedure set',
    outcomes.every((o) => o.outcome !== 'answered' || report.procedureIds.includes(o.procedureId)),
    `${report.procedureIds.length} procedures in the set`,
  );

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
