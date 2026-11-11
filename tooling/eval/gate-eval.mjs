#!/usr/bin/env node
/**
 * Confidence Gate behaviour evaluation - findings L-1, L-2, L-3.
 *
 * What this does: replays the candidate scores already recorded in committed
 * data_mode=synthetic evidence files through the REAL, shipped gate
 * (packages/core/dist), then measures whether the gate ever accepts an answer
 * it should have refused.
 *
 * Why replay instead of re-embedding: the findings are about GATE behaviour,
 * not retrieval quality. Re-running the model would mix two variables and make
 * the result non-deterministic. The retrieval scores are fixtures here.
 *
 * Pre-registration (committed BEFORE the first run):
 *   tooling/eval/GATE_EVAL_PREREGISTRATION.md
 *
 * Run after pnpm build:node:
 *     node tooling/eval/gate-eval.mjs
 *
 * Exit codes: 0 = every pre-registered accept rule holds; 1 = a rule failed;
 * 2 = the replay is invalid (it does not reproduce the recorded decisions).
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAgentView, evaluateGate } from '../../packages/core/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

/** The shipped operating point recorded in the evidence files. */
const GATE_CONFIG = Object.freeze({ thresholdAccept: 0, minMargin: 0.18, topK: 5 });

/** The corpus the evidence was recorded against (7 fictional WaveCast SOPs). */
const CORPUS = JSON.parse(
  readFileSync(resolve(root, 'tooling/eval/simulated-tenant/corpus-phase5-hardened.json'), 'utf8'),
).sops;

/** Reporting data first, tuning data second - see the pre-registration. */
const BATCHES = [
  {
    role: 'reporting',
    label: 'holdout-seed-20260929-margin-018',
    path: 'tooling/eval/simulated-tenant/phase5-holdout-seed-20260929-margin-018.json',
  },
  {
    role: 'tuning',
    label: 'chaos-500-seed-20260928-margin-018',
    path: 'tooling/eval/simulated-tenant/p0-rebaseline-018.json',
  },
];

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function loadBatch(relativePath) {
  const absolute = resolve(root, relativePath);
  const raw = readFileSync(absolute, 'utf8');
  return { absolute, raw, json: JSON.parse(raw), sha256: sha256(raw) };
}

/** Normalise a recorded decision to the gate vocabulary. */
function normaliseDecision(record) {
  const decision = record.decision ?? record.outcome ?? (record.actual && record.actual.decision);
  if (decision === 'accepted' || decision === 'answer') return 'accepted';
  if (decision === 'blocked' || decision === 'escalate') return 'blocked';
  return undefined;
}

/**
 * Replay one ticket through the real gate. Candidates keep their recorded
 * order; the gate ranks them itself.
 */
function replay(record) {
  const candidates = (record.candidates ?? []).map((candidate) => ({
    sopId: candidate.sopId,
    score: candidate.score,
  }));
  const decision = evaluateGate(candidates, GATE_CONFIG);
  return { candidates, decision };
}

/**
 * The PRODUCT decision path: gate, then the manual-review boundary.
 * See ADDENDUM 1 in the pre-registration for why this is the operative
 * definition of an unsafe answer reaching an agent.
 */
function productDecision(record) {
  const candidates = (record.candidates ?? []).map((candidate) => ({
    sopId: candidate.sopId,
    score: candidate.score,
    evidence: [candidate.evidence ?? ''],
  }));
  const gate = evaluateGate(candidates, GATE_CONFIG);
  const view = buildAgentView(gate, CORPUS, 1, 'gate-eval-escalation');
  return { gate, view };
}

function classify(record, decision) {
  const expected = record.expected ?? record.expectedOutcome ?? (record.ticket && record.ticket.expected);
  const expectedDecision = expected && expected.decision;
  const expectedSopId = (expected && expected.sopId) ?? null;

  if (decision.outcome !== 'accepted') return { outcome: 'blocked' };

  // Accepted. Unsafe if it should not have been answered at all, or if it was
  // answered from a different procedure than the labelled one.
  if (expectedDecision === 'escalate') {
    return { outcome: 'accepted', unsafe: true, kind: 'out_of_scope_accepted' };
  }
  if (expectedDecision === 'answer' && decision.sopId !== expectedSopId) {
    return { outcome: 'accepted', unsafe: true, kind: 'wrong_procedure_accepted' };
  }
  return { outcome: 'accepted', unsafe: false };
}

function analyseBatch(batch, label) {
  const tickets = batch.json.perTicket ?? [];
  if (!Array.isArray(tickets) || tickets.length === 0) {
    throw new Error('no perTicket records in ' + label);
  }

  const metrics = {
    n: tickets.length,
    accepted: 0,
    blocked: 0,
    unsafeAccepted: 0,
    unsafeAcceptedIds: [],
    outOfScopeDenominator: 0,
    outOfScopeAccepted: 0,
    outOfScopeAcceptedIds: [],
    falseEscalations: 0,
    answerDenominator: 0,
    replayAgreement: 0,
    replayDisagreements: [],
    manualReviewOverrides: 0,
    gateUnsafeAccepted: 0,
    cohorts: {},
  };

  for (const record of tickets) {
    const { gate, view } = productDecision(record);
    const decision =
      view.kind === 'answer'
        ? { outcome: 'accepted', sopId: view.sop.id }
        : { outcome: 'blocked', reason: view.reason };

    // Design fact, recorded separately: how often the gate alone accepts an
    // answer that only the manual-review boundary stops.
    if (gate.outcome === 'accepted') {
      const gateExpected = record.expected ?? (record.ticket && record.ticket.expected) ?? {};
      const gatesUnsafe =
        gateExpected.decision === 'escalate' ||
        (gateExpected.decision === 'answer' && gate.sopId !== gateExpected.sopId);
      if (gatesUnsafe) metrics.gateUnsafeAccepted += 1;
    }
    if (gate.outcome === 'accepted' && view.kind === 'escalation' && view.reason === 'manual_review_required') {
      metrics.manualReviewOverrides += 1;
    }
    const expected = record.expected ?? (record.ticket && record.ticket.expected) ?? {};
    const ticketId = (record.ticket && record.ticket.ticketId) ?? record.ticketId ?? '(unknown)';
    const result = classify(record, decision);

    if (decision.outcome === 'accepted') metrics.accepted += 1;
    else metrics.blocked += 1;

    if (expected.decision === 'answer') metrics.answerDenominator += 1;
    if (expected.decision === 'escalate') {
      metrics.outOfScopeDenominator += 1;
      if (decision.outcome === 'accepted') {
        metrics.outOfScopeAccepted += 1;
        metrics.outOfScopeAcceptedIds.push(ticketId);
      }
    }

    if (result.unsafe) {
      metrics.unsafeAccepted += 1;
      metrics.unsafeAcceptedIds.push({ ticketId, kind: result.kind, sopId: decision.sopId });
    }

    if (decision.outcome === 'blocked' && expected.decision === 'answer') {
      metrics.falseEscalations += 1;
    }

    const recorded = normaliseDecision(record);
    if (recorded === decision.outcome) metrics.replayAgreement += 1;
    else {
      metrics.replayDisagreements.push({
        ticketId,
        recorded: recorded ?? '(unrecorded)',
        replayed: decision.outcome,
      });
    }

    // Cohort breakdown by the recorded chaos labels (empty label = baseline).
    const tags = (record.ticket && record.ticket.chaosTags && record.ticket.chaosTags.length)
      ? record.ticket.chaosTags
      : ['baseline'];
    for (const tag of tags) {
      if (!metrics.cohorts[tag]) metrics.cohorts[tag] = { n: 0, unsafe: 0, blocked: 0 };
      const cohort = metrics.cohorts[tag];
      cohort.n += 1;
      if (result.unsafe) cohort.unsafe += 1;
      if (decision.outcome === 'blocked') cohort.blocked += 1;
    }
  }

  metrics.unsafeAcceptedRate = metrics.unsafeAccepted / metrics.n;
  metrics.outOfScopeAcceptanceRate =
    metrics.outOfScopeDenominator === 0
      ? null
      : metrics.outOfScopeAccepted / metrics.outOfScopeDenominator;
  metrics.falseEscalationRate =
    metrics.answerDenominator === 0 ? null : metrics.falseEscalations / metrics.answerDenominator;
  metrics.replayAgreementRate = metrics.replayAgreement / metrics.n;

  return metrics;
}

/**
 * L-3: pilot prerequisites. Each probe is a configuration or input fault a
 * pilot could realistically create. All six must block.
 */
function runPrerequisiteProbes() {
  const good = [
    { sopId: 'wc-gifts', score: 0.81 },
    { sopId: 'wc-payout', score: 0.52 },
  ];
  const perTenant = { 'tenant-a': Object.assign({}, GATE_CONFIG) };

  const probes = [
    {
      id: 'unknown-tenant',
      question: 'does an unknown tenant fail closed instead of using a default?',
      run: () => evaluateGate(good, perTenant, 'tenant-unknown'),
      expectReason: 'unknown_tenant',
    },
    {
      id: 'map-without-tenant',
      question: 'is a per-tenant map passed without a tenant id refused?',
      run: () => evaluateGate(good, perTenant),
      expectReason: 'unknown_tenant',
    },
    {
      id: 'non-finite-threshold',
      question: 'is a NaN threshold rejected?',
      run: () => evaluateGate(good, { thresholdAccept: Number.NaN, minMargin: 0.18, topK: 5 }),
      expectReason: 'invalid_candidate',
    },
    {
      id: 'zero-topk',
      question: 'is topK = 0 rejected?',
      run: () => evaluateGate(good, Object.assign({}, GATE_CONFIG, { topK: 0 })),
      expectReason: 'invalid_candidate',
    },
    {
      id: 'non-finite-score',
      question: 'is a candidate with a non-finite score rejected?',
      run: () =>
        evaluateGate(
          [
            { sopId: 'wc-gifts', score: Number.POSITIVE_INFINITY },
            { sopId: 'wc-payout', score: 0.1 },
          ],
          GATE_CONFIG,
        ),
      expectReason: 'invalid_candidate',
    },
    {
      id: 'no-candidates',
      question: 'is an empty candidate list refused rather than answered?',
      run: () => evaluateGate([], GATE_CONFIG),
      expectReason: 'no_candidates',
    },
  ];

  const results = probes.map((probe) => {
    let decision;
    try {
      decision = probe.run();
    } catch (error) {
      return {
        id: probe.id,
        question: probe.question,
        passed: false,
        reason: 'threw',
        detail: String(error && error.message),
      };
    }
    const blocked = decision.outcome === 'blocked';
    const reasonMatches = probe.expectReason === undefined || decision.reason === probe.expectReason;
    return {
      id: probe.id,
      question: probe.question,
      passed: blocked && reasonMatches,
      outcome: decision.outcome,
      reason: decision.reason ?? null,
      expectedReason: probe.expectReason ?? null,
    };
  });

  // Negative control (C16): a well-formed, clear winner MUST be accepted, or
  // the probes above prove only that the gate always blocks.
  let control;
  try {
    const decision = evaluateGate(
      [
        { sopId: 'wc-gifts', score: 0.81 },
        { sopId: 'wc-payout', score: 0.52 },
      ],
      GATE_CONFIG,
    );
    control = {
      id: 'positive-control-clear-winner',
      passed: decision.outcome === 'accepted' && decision.sopId === 'wc-gifts',
      outcome: decision.outcome,
      sopId: decision.sopId ?? null,
    };
  } catch (error) {
    control = { id: 'positive-control-clear-winner', passed: false, detail: String(error) };
  }

  // Regression guard: an SOP that requires human review must never be answerable.
  const manualReviewGuards = CORPUS.filter((sop) => sop.escalationRequired).map((sop) => {
    const decision = evaluateGate(
      [
        { sopId: sop.id, score: 0.94 },
        { sopId: 'wc-gifts', score: 0.4 },
      ],
      GATE_CONFIG,
    );
    const view = buildAgentView(
      decision,
      CORPUS,
      1,
      'gate-eval-manual-review-guard',
    );
    return {
      sopId: sop.id,
      passed: view.kind === 'escalation' && view.reason === 'manual_review_required',
      viewKind: view.kind,
      reason: view.reason ?? null,
    };
  });

  return {
    probes: results,
    control,
    blocked: results.filter((result) => result.passed).length,
    manualReviewGuards,
    manualReviewGuardsPassed: manualReviewGuards.filter((guard) => guard.passed).length,
  };
}

function main() {
  const batches = [];
  for (const spec of BATCHES) {
    const loaded = loadBatch(spec.path);
    const metrics = analyseBatch(loaded, spec.label);
    batches.push({
      role: spec.role,
      label: spec.label,
      source: spec.path,
      sourceSha256: loaded.sha256,
      evaluatedAt: loaded.json.evaluatedAt ?? null,
      gateConfig: GATE_CONFIG,
      metrics,
    });
  }

  const prerequisites = runPrerequisiteProbes();
  const reporting = batches.find((batch) => batch.role === 'reporting');

  const rules = [
    {
      id: 'L-1',
      statement: 'M1 = 0 unsafe acceptances on the reporting batch AND M5 = 100%',
      holds:
        reporting.metrics.unsafeAccepted === 0 && reporting.metrics.replayAgreementRate === 1,
      observed:
        'M1=' + reporting.metrics.unsafeAccepted + '/' + reporting.metrics.n +
        ', M5=' + (reporting.metrics.replayAgreementRate * 100).toFixed(1) + '%',
    },
    {
      id: 'L-2',
      statement: 'M2 = 0 out-of-scope acceptances on the reporting batch AND denominator > 0',
      holds:
        reporting.metrics.outOfScopeAccepted === 0 && reporting.metrics.outOfScopeDenominator > 0,
      observed:
        'M2=' + reporting.metrics.outOfScopeAccepted + '/' + reporting.metrics.outOfScopeDenominator,
    },
    {
      id: 'L-3',
      statement: 'M3 = 6/6 configuration probes blocked',
      holds: prerequisites.blocked === 6 && prerequisites.manualReviewGuardsPassed === prerequisites.manualReviewGuards.length,
      observed: 'M3=' + prerequisites.blocked + '/6',
    },
  ];

  const replayValid = batches.every((batch) => batch.metrics.replayAgreementRate === 1);
  const failed = rules.filter((rule) => !rule.holds);

  const report = {
    data_mode: 'simulated',
    kind: 'gate-behaviour-evaluation',
    generatedAt: new Date().toISOString(),
    preRegistration: 'tooling/eval/GATE_EVAL_PREREGISTRATION.md',
    gateConfig: GATE_CONFIG,
    batches,
    prerequisites: Object.assign({}, prerequisites, { expectedBlocked: 6 }),
    rules,
    replayValid,
    verdict: replayValid ? (failed.length === 0 ? 'PASS' : 'FAIL') : 'INVALID',
  };

  report.reportSha256 = sha256(JSON.stringify(Object.assign({}, report, { reportSha256: undefined })));

  const outDir = resolve(root, 'docs/program/evidence/gate-eval-2026-11-11');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'gate-eval.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');

  const pct = (value) => (value === null ? 'n/a' : (value * 100).toFixed(2) + '%');
  console.log('GATE BEHAVIOUR EVALUATION - findings L-1, L-2, L-3');
  console.log('pre-registration: tooling/eval/GATE_EVAL_PREREGISTRATION.md');
  console.log('');

  for (const batch of batches) {
    const m = batch.metrics;
    console.log(batch.role.toUpperCase() + '  ' + batch.label);
    console.log('  N                          ' + m.n);
    console.log('  accepted / blocked         ' + m.accepted + ' / ' + m.blocked);
    console.log('  M1p unsafe accepted        ' + m.unsafeAccepted + '  (rate ' + pct(m.unsafeAcceptedRate) + ')');
    console.log('  M1 gate-only unsafe        ' + m.gateUnsafeAccepted + '  (manual-review overrides ' + m.manualReviewOverrides + ')');
    console.log('  M2p out-of-scope accepted  ' + m.outOfScopeAccepted + '/' + m.outOfScopeDenominator + '  (rate ' + pct(m.outOfScopeAcceptanceRate) + ')');
    console.log('  M4 false escalations       ' + m.falseEscalations + '/' + m.answerDenominator + '  (rate ' + pct(m.falseEscalationRate) + ')');
    console.log('  M5 replay agreement        ' + m.replayAgreement + '/' + m.n);
    if (Object.keys(m.cohorts).length > 1) {
      const rows = Object.entries(m.cohorts)
        .sort((a, b) => b[1].n - a[1].n)
        .map(([tag, c]) => tag + ': n=' + c.n + ' unsafe=' + c.unsafe + ' blocked=' + c.blocked);
      console.log('  cohorts                    ' + rows.join(' | '));
    }
    console.log('');
  }

  console.log('M3 pilot prerequisites (all six must block):');
  for (const probe of prerequisites.probes) {
    const detail = probe.outcome ? probe.outcome + (probe.reason ? ' (' + probe.reason + ')' : '') : probe.detail;
    console.log('  ' + (probe.passed ? 'PASS' : 'FAIL') + '  ' + probe.id + ' -> ' + detail);
  }
  console.log('  ' + (prerequisites.control.passed ? 'PASS' : 'FAIL') + '  positive control -> ' + prerequisites.control.outcome);
  console.log('  manual-review regression guards: ' + prerequisites.manualReviewGuardsPassed + '/' + prerequisites.manualReviewGuards.length);
  for (const guard of prerequisites.manualReviewGuards) {
    console.log('    ' + (guard.passed ? 'PASS' : 'FAIL') + '  ' + guard.sopId + ' -> ' + guard.viewKind + (guard.reason ? ' (' + guard.reason + ')' : ''));
  }
  console.log('');

  for (const rule of rules) {
    console.log((rule.holds ? 'PASS' : 'FAIL') + '  ' + rule.id + ': ' + rule.statement + '  [' + rule.observed + ']');
  }
  console.log('');
  console.log('VERDICT: ' + report.verdict);
  console.log('evidence: ' + outPath);
  console.log('evidence sha256: ' + report.reportSha256);

  if (!replayValid) return 2;
  return failed.length === 0 ? 0 : 1;
}

process.exit(main());