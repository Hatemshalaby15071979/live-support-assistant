#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_GATE_CONFIG,
  buildAgentView,
  evaluateGate,
} from '../../packages/core/dist/index.js';
import { EMBEDDING_MODEL, createEmbedder } from '../../packages/embedder/dist/index.js';
import { buildCorpusPassages, searchTopK } from '../../packages/vector-store/dist/index.js';
import { labelQuery } from './simulated-tenant/expected-outcome.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const inputDir = resolve(root, 'tooling/eval/simulated-tenant');
const evidenceDir = resolve(root, 'docs/program/evidence/live-support-local-eval-2026-11-05');
const modelPath = resolve(
  root,
  '.cache/transformers',
  EMBEDDING_MODEL.id,
  EMBEDDING_MODEL.revision,
);
const margin = 0.18;

const tenants = [
  {
    tenantId: 'SIM-TENANT-WAVECAST',
    batch: 'chaos-500.json',
    corpus: 'corpus.json',
    split: 'full',
  },
  {
    tenantId: 'SIM-TENANT-WAVECAST',
    batch: 'holdout-500-seed-20260929.json',
    corpus: 'corpus.json',
    split: 'holdout',
  },
];

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;
const data = (name) => {
  const bytes = readFileSync(resolve(inputDir, name));
  return { value: JSON.parse(bytes.toString('utf8')), sha256: sha256(bytes) };
};
const percentile = (values, at) =>
  [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * at) - 1)] ?? 0;

function isCorrect(expected, actual) {
  return actual.decision === expected.decision
    && (actual.decision === 'escalate' || actual.sopId === expected.sopId);
}

function summarize(rows) {
  const failures = rows.filter((row) => !row.correct);
  return {
    tickets: rows.length,
    correct: rows.length - failures.length,
    accuracy: rows.length === 0 ? 0 : (rows.length - failures.length) / rows.length,
    falseEscalations: failures.filter((row) => row.actual.decision === 'escalate' && row.expected.decision === 'answer').length,
    unsafeAnswers: failures.filter((row) => row.actual.decision === 'answer' && row.expected.decision === 'escalate').length,
    wrongProcedure: failures.filter((row) => row.actual.decision === 'answer' && row.expected.decision === 'answer').length,
    runtimeErrors: failures.filter((row) => row.error !== undefined).length,
  };
}

async function evaluate({ tenantId, batch: batchName, corpus: corpusName, split }, embedder) {
  const batchFile = typeof batchName === 'string' ? data(batchName) : {
    value: batchName.value,
    sha256: sha256(canonical(batchName.value)),
    name: batchName.name,
  };
  const corpusFile = typeof corpusName === 'string' ? data(corpusName) : {
    value: corpusName.value,
    sha256: sha256(canonical(corpusName.value)),
    name: corpusName.name,
  };
  const batch = batchFile.value;
  const corpus = corpusFile.value;
  if (
    batch.data_mode !== 'simulated'
    || corpus.data_mode !== 'simulated'
    || !Array.isArray(batch.tickets)
    || batch.tickets.length !== batch.ticketCount
    || !Array.isArray(corpus.sops)
    || corpus.sops.some((sop) => sop.data_mode !== 'simulated')
    || batch.tickets.some((ticket) => ticket.data_mode !== 'simulated')
  ) {
    throw new Error(`refusing untagged evaluation inputs: ${batchName}/${corpusName}`);
  }
  const passages = buildCorpusPassages(corpus.sops);
  const vectors = await embedder.embedPassages(passages.map((passage) => passage.text));
  const entries = passages.map((passage, index) => {
    const vector = vectors[index];
    if (vector === undefined) throw new Error(`missing vector for ${passage.sopId}`);
    return { sopId: passage.sopId, vector, text: passage.text };
  });
  const keywords = new Map(corpus.sops.map((sop) => [sop.id, sop.triggerKeywords]));
  const latencies = [];
  const rows = [];

  for (const ticket of batch.tickets) {
    const query = ticket.message.trim();
    const started = performance.now();
    const label = labelQuery({
      message: query,
      language: ticket.language,
      expectedDecision: ticket.expected.decision,
      procedureKeywords: keywords.get(ticket.expected.sopId ?? '') ?? [],
    });
    const expected = { decision: label.expectedOutcome, sopId: ticket.expected.sopId };
    try {
      const queryVector = await embedder.embedQuery(query);
      const candidates = searchTopK(queryVector, entries, 5);
      const decision = evaluateGate(candidates, {
        thresholdAccept: DEFAULT_GATE_CONFIG.thresholdAccept,
        minMargin: margin,
        topK: DEFAULT_GATE_CONFIG.topK,
      });
      const activeSops = corpus.sops;
      const view = buildAgentView(decision, activeSops, 1, `SIM-ESCALATION-${ticket.ticketId}`);
      const actual = view.kind === 'answer'
        ? { decision: 'answer', sopId: view.sop.id }
        : { decision: 'escalate', reason: view.reason };
      const latencyMs = performance.now() - started;
      latencies.push(latencyMs);
      rows.push({
        ticketId: ticket.ticketId,
        data_mode: 'simulated',
        expected,
        actual,
        correct: isCorrect(expected, actual),
        labelReclassified: label.reclassified,
        latencyMs,
        topCandidates: decision.evidence.slice(0, 3).map(({ sopId, score }) => ({ sopId, score })),
      });
    } catch (error) {
      const actual = { decision: 'escalate', reason: 'evaluation_error' };
      rows.push({
        ticketId: ticket.ticketId,
        data_mode: 'simulated',
        expected,
        actual,
        correct: false,
        labelReclassified: label.reclassified,
        latencyMs: performance.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    tenantId,
    split,
    sourceBatch: batchFile.name ?? batchName,
    sourceCorpus: corpusFile.name ?? corpusName,
    batchSha256: batchFile.sha256,
    corpusSha256: corpusFile.sha256,
    batchSeed: batch.seed ?? null,
    counts: {
      ...summarize(rows),
      chaosTickets: batch.tickets.filter((ticket) => ticket.isChaos).length,
      latencyMs: {
        mean: latencies.reduce((sum, value) => sum + value, 0) / Math.max(1, latencies.length),
        median: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
        max: Math.max(0, ...latencies),
      },
    },
    tickets: rows,
  };
}

function cedarGroveData() {
  const sopSpecs = [
    ['cg-enrollment', 'Enrollment and course registration', 'enrollment, registration, course, join, class', 'For a registration question, verify the course and enrollment status in the learner portal. If a class is full or registration is closed, route to Enrollment; never promise a seat.'],
    ['cg-content', 'Course access and lesson content', 'lesson, course access, video, material, module', 'For missing lessons or course materials, confirm the learner is enrolled in the correct course and refresh the learning dashboard. Route persistent access failures to Learning Support.'],
    ['cg-billing', 'Invoices and tuition payments', 'invoice, tuition, payment, charge, receipt', 'For billing questions, compare the invoice status with the payment receipt. Do not request full payment-card details. Route duplicate or unrecognized charges to Finance for review.'],
    ['cg-attendance', 'Attendance and completion records', 'attendance, completion, certificate, progress, record', 'For attendance or completion corrections, collect the course and session date, then route the record to the instructor for review. Do not promise a certificate before records are reconciled.'],
    ['cg-account', 'Learner account recovery', 'password, login, account, reset, code', 'For routine login problems, use the account recovery flow and request one fresh code. Never ask a learner to share a password or one-time code.'],
    ['cg-safety', 'Learner safety concern escalation', 'safety, threat, harm, urgent, safeguarding', 'Any immediate safety concern requires urgent safeguarding-team review. Do not investigate in chat or promise confidentiality; use the approved urgent escalation route.'],
  ];
  const sops = sopSpecs.map(([id, title, keywordText, summary], index) => ({
    data_mode: 'simulated',
    id,
    title,
    category: `Cedar Grove ${index + 1}`,
    triggerKeywords: keywordText.split(', '),
    summary: `${summary} These are fictional Cedar Grove Online School procedures for a local model evaluation only.`,
    suggestedReply: 'I can help route this to the appropriate Cedar Grove support team.',
    escalationRequired: id === 'cg-safety',
    escalationReason: id === 'cg-safety' ? 'Safety concerns require urgent specialist review.' : '',
  }));
  const examples = [
    ['cg-enrollment', 'answer', [
      'I registered for the evening algebra class but it is missing from my course list.',
      'Can you check whether my biology course registration went through?',
      'The course enrollment page says pending after I joined the class yesterday.',
      'I need help confirming my registration for the next history course.',
      'My class enrollment is not showing in the learner portal.',
    ]],
    ['cg-content', 'answer', [
      'The lesson video will not load even though I can open the course.',
      'Several course materials disappeared from my learning dashboard.',
      'I am enrolled but cannot access the next module or its lesson files.',
      'The course video stops and the lesson page will not finish loading.',
      'My enrolled class has no visible lesson content today.',
    ]],
    ['cg-billing', 'answer', [
      'I paid tuition but the invoice still shows an outstanding balance.',
      'Could Finance review a duplicate course payment charge on my receipt?',
      'My tuition payment went through but the invoice status did not change.',
      'I cannot find the receipt for the latest class payment.',
      'The invoice lists a charge I do not recognize for my course.',
    ]],
    ['cg-attendance', 'answer', [
      'My attendance record is missing the session I joined on Monday.',
      'I completed the course but my progress record still says incomplete.',
      'The certificate has not appeared after all course sessions were marked done.',
      'Please review the attendance entry for my last biology class.',
      'My course completion record does not include the final session.',
    ]],
    ['cg-account', 'answer', [
      'I cannot log in after changing my password yesterday.',
      'The account reset code is not arriving on my registered device.',
      'The login page keeps returning me to the password reset screen.',
      'How do I recover access to my learner account?',
      'My password reset link did not let me sign in to class.',
    ]],
    ['cg-safety', 'escalate', [
      'I am worried about a threat made during class and need urgent safeguarding help.',
      'A learner described immediate harm; please escalate this safety concern.',
      'There is a threat involving a student and the safeguarding team needs to review it.',
      'I have an urgent safety concern about something that happened in the course.',
      'Please route this potential harm report to safeguarding immediately.',
    ]],
    [null, 'escalate', [
      'I have a question that is not covered by the course or account procedures.',
      'Can someone review an unusual situation that does not match these support steps?',
      'I need help with a matter that is not described in the available procedures.',
      'Please route this unsupported request for human review.',
      'I am not sure which course procedure applies to this situation.',
    ]],
  ];
  const records = [];
  for (let index = 0; index < 100; index += 1) {
    const categoryIndex = index % examples.length;
    const [sopId, decision, messages] = examples[categoryIndex];
    const message = messages[Math.floor(index / examples.length) % messages.length];
    records.push({
      ticketId: `SIM-CEDAR-${String(index + 1).padStart(3, '0')}`,
      tenantId: 'SIM-TENANT-CEDAR-GROVE',
      data_mode: 'simulated',
      language: 'en',
      message,
      isChaos: false,
      expected: { decision, sopId },
    });
  }
  const corpus = {
    name: 'generated-cedar-grove-corpus',
    value: {
      data_mode: 'simulated',
      source: 'Deterministically authored fictional Cedar Grove Online School procedures.',
      sops,
    },
  };
  const batches = [records.slice(0, 50), records.slice(50)].map((tickets, index) => ({
    name: `generated-cedar-grove-${index === 0 ? 'full' : 'holdout'}-seed-20261105`,
    value: {
      data_mode: 'simulated',
      ticketCount: tickets.length,
      seed: 20261105 + index,
      chaosRateConfigured: 0,
      chaosRateActual: 0,
      tickets,
    },
  }));
  return batches.map((batch, index) => ({
    tenantId: 'SIM-TENANT-CEDAR-GROVE',
    batch,
    corpus,
    split: index === 0 ? 'full' : 'holdout',
  }));
}

const embedder = await createEmbedder(EMBEDDING_MODEL, {
  modelPath,
  allowRemoteModels: false,
});
const runs = [];
for (const tenant of tenants) runs.push(await evaluate(tenant, embedder));
for (const tenant of cedarGroveData()) runs.push(await evaluate(tenant, embedder));

const manifest = {
  data_mode: 'simulated',
  generatedAt: new Date().toISOString(),
  scope: 'Local model and decision-path inference only; not an authenticated app, tenant-isolation, or hosted-service test.',
  git: {
    commit: (await import('node:child_process')).execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    dirty: (await import('node:child_process')).execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
    }).trim() !== '',
  },
  implementation: {
    modelId: embedder.modelId,
    modelRevision: embedder.revision,
    dimensions: embedder.dimensions,
    margin,
    path: 'Node offline MiniLM → passage cosine searchTopK → evaluateGate → buildAgentView',
    runnerSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
  },
  runs,
};

const totalErrors = runs.reduce((sum, run) => sum + run.counts.runtimeErrors, 0);
mkdirSync(evidenceDir, { recursive: true });
const outPath = resolve(evidenceDir, 'local-inference-results.json');
writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
const summary = runs.map(({ tenantId, split, counts }) => ({
  tenantId,
  split,
  ...counts,
}));
console.log(JSON.stringify({ output: outPath, summary }, null, 2));
if (totalErrors > 0) process.exitCode = 1;
