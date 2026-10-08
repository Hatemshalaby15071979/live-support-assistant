#!/usr/bin/env node
/**
 * Market Twin — the one command, one seed, one reproducible report (V2 §P2).
 *
 *   node tooling/market/run-market.mjs --seed 20261006 --rung smoke
 *
 * Exits 0 only when every invariant holds. The same seed twice produces byte-identical output.
 *
 * SCOPE OF THE SMOKE RUNG — read this before quoting any number from the report.
 * This rung is a HARNESS rung. It proves that the traffic generator, the ten chaos events, the
 * invariant assertions and the report are deterministic and correctly wired. It does NOT measure
 * retrieval: there is no embedder in the path, no corpus is read, and the gold set and the
 * held-out split are never touched. The decision function is an explicitly-labelled deterministic
 * stub that models a working gate, so `unsafe` is 0 BY CONSTRUCTION here and is not evidence about
 * the shipped gate. Retrieval quality is P3/P4 work, measured with the embedder.
 *
 * Determinism is proven for this machine and this tree. Cross-machine determinism is NOT proven.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRng, generateProcedures, generateTraffic, RUNGS, TENANTS } from './traffic.mjs';
import { runChaos } from './chaos.mjs';
import { assertInvariants } from './assert.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SCORER = 'deterministic-stub-v1';

// ------------------------------------------------------------------ arguments ---

function parseArgs(argv) {
  const args = { seed: null, rung: 'smoke' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--seed') args.seed = Number(argv[i + 1]);
    else if (argv[i] === '--rung') args.rung = String(argv[i + 1]);
  }
  if (!Number.isInteger(args.seed)) {
    process.stderr.write('usage: run-market.mjs --seed <integer> --rung smoke\n');
    process.exit(2);
  }
  if (!RUNGS[args.rung]) {
    process.stderr.write(`unknown rung '${args.rung}'; known: ${Object.keys(RUNGS).join(', ')}\n`);
    process.exit(2);
  }
  return args;
}

// ------------------------------------------------------------------- helpers ---

/** Canonical JSON: object keys sorted, so the bytes do not depend on insertion order. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * The HEAD sha, read from .git without spawning a child process (spawn is unreliable on this host).
 * Falls back to 'unknown' rather than failing the run.
 */
function readHeadSha() {
  try {
    const gitDir = resolve(ROOT, '.git');
    const head = readFileSync(resolve(gitDir, 'HEAD'), 'utf8').trim();
    if (head.startsWith('ref: ')) {
      const ref = head.slice(5);
      const loose = resolve(gitDir, ref);
      if (existsSync(loose)) return readFileSync(loose, 'utf8').trim();
      const packed = resolve(gitDir, 'packed-refs');
      if (existsSync(packed)) {
        const line = readFileSync(packed, 'utf8')
          .split('\n')
          .find((l) => l.endsWith(` ${ref}`));
        if (line) return line.split(' ')[0];
      }
      return 'unknown';
    }
    return head; // detached HEAD: HEAD holds the sha
  } catch {
    return 'unknown';
  }
}

function readBranch() {
  try {
    const head = readFileSync(resolve(ROOT, '.git/HEAD'), 'utf8').trim();
    return head.startsWith('ref: refs/heads/') ? head.slice('ref: refs/heads/'.length) : 'detached';
  } catch {
    return 'unknown';
  }
}

/**
 * The decision function for this rung. A STUB: it models a gate that refuses out-of-scope and
 * adversarial messages and answers in-scope ones with the expected procedure. It is deterministic
 * and embedding-free, and it is not a measurement of anything.
 */
function decide(message) {
  if (message.groundTruth === 'out_of_scope') {
    return {
      outcome: 'escalated',
      procedureId: null,
      score: null,
      margin: null,
      reason: message.isAdversarial ? 'adversarial_refused' : 'out_of_scope',
      decidedOnText: false,
    };
  }
  return {
    outcome: 'answered',
    procedureId: message.expectedProcedureId,
    score: 0.8,
    margin: 0.2,
    reason: 'in_scope',
    decidedOnText: false,
  };
}

// ---------------------------------------------------------------------- run ---

const args = parseArgs(process.argv.slice(2));
const rung = RUNGS[args.rung];
const tenant = TENANTS[0];

const rng = createRng(args.seed);
const procedures = generateProcedures(rng, tenant, rung.proceduresPerTenant);
const messages = generateTraffic(rng, tenant, procedures, rung.messages);
const chaos = runChaos(rng, { tenantId: tenant.id });

const outcomes = messages.map((m) => {
  const d = decide(m);
  return {
    id: m.id,
    ticketId: m.ticketId,
    language: m.language,
    isRepeat: m.isRepeat,
    isAdversarial: m.isAdversarial,
    groundTruth: m.groundTruth,
    text: m.text,
    outcome: d.outcome,
    procedureId: d.procedureId,
    score: d.score,
    margin: d.margin,
    reason: d.reason,
    decidedOnText: d.decidedOnText,
  };
});

const distinctTexts = [...new Set(messages.map((m) => m.text))];
const distinctTickets = [...new Set(messages.map((m) => m.ticketId))];

const totals = {
  answered: outcomes.filter((o) => o.outcome === 'answered').length,
  escalated: outcomes.filter((o) => o.outcome === 'escalated').length,
  unsafe: outcomes.filter((o) => o.groundTruth === 'out_of_scope' && o.outcome === 'answered').length,
  falseEscalation: outcomes.filter((o) => o.groundTruth === 'in_scope' && o.outcome === 'escalated').length,
  correct: outcomes.filter((o) => o.outcome === 'answered' && o.procedureId === messages.find((m) => m.id === o.id).expectedProcedureId).length,
  distinctMessages: distinctTexts.length,
};

const byLanguage = {};
for (const o of outcomes) {
  byLanguage[o.language] ??= { messages: 0, distinct: 0, answered: 0, escalated: 0, unsafe: 0 };
  byLanguage[o.language].messages += 1;
  byLanguage[o.language][o.outcome] += 1;
  if (o.groundTruth === 'out_of_scope' && o.outcome === 'answered') byLanguage[o.language].unsafe += 1;
}
for (const t of distinctTexts) {
  const lang = messages.find((m) => m.text === t).language;
  byLanguage[lang].distinct += 1;
}

const perLanguage = Object.keys(byLanguage)
  .sort()
  .map((lang) => ({ language: lang, ...byLanguage[lang] }));

const perTenant = [
  {
    tenant: tenant.name,
    tenantId: tenant.id,
    procedures: procedures.length,
    messages: outcomes.length,
    distinct: distinctTexts.length,
    tickets: distinctTickets.length,
    answered: totals.answered,
    escalated: totals.escalated,
    unsafe: totals.unsafe,
    falseEscalation: totals.falseEscalation,
  },
];

const decisionDigest = sha256(canonical({ seed: args.seed, rung: args.rung, outcomes, totals, chaos }));

const report = {
  rung: args.rung,
  label: `${args.rung}-${args.seed}`,
  seed: args.seed,
  scorer: SCORER,
  retrieval_measured: false,
  data_mode: {
    mode: 'synthetic',
    heldOutRead: false,
    goldSetRead: false,
    corpusRead: false,
    embedderUsed: false,
    note: 'No corpus, no gold set, no held-out split, no embedder. Synthetic traffic over synthetic procedures.',
  },
  git: { sha: readHeadSha(), branch: readBranch() },
  traffic: {
    tenants: 1,
    procedures: procedures.length,
    totalMessages: outcomes.length,
    distinctMessages: distinctTexts.length,
    tickets: distinctTickets.length,
  },
  totals,
  tables: { perTenant, perLanguage },
  chaos,
  invariants: [],
  digest: decisionDigest,
};

const { checks, failed } = assertInvariants({
  ...report,
  outcomes,
  procedureIds: procedures.map((p) => p.id),
  traffic: { ...report.traffic, totalMessages: outcomes.length, distinctMessages: distinctTexts.length, tickets: distinctTickets.length },
  totals,
  dataMode: report.data_mode,
});
report.invariants = checks;

// ------------------------------------------------------------------- reports ---

const reportsDir = resolve(ROOT, 'tooling/market/reports');
mkdirSync(reportsDir, { recursive: true });

const jsonPath = resolve(reportsDir, `${report.label}.json`);
writeFileSync(jsonPath, `${JSON.stringify(JSON.parse(canonical(report)), null, 2)}\n`, 'utf8');

const md = [];
md.push(`# Market Twin — ${report.rung} rung (seed ${report.seed})`);
md.push('');
md.push('> **This rung is a harness rung.** It proves traffic, chaos, invariants and the report are');
md.push('> deterministic and correctly wired. It does **not** measure retrieval: no embedder is in the');
md.push(`> path, no corpus is read, and the decision function is \`${SCORER}\`, a deterministic stub that`);
md.push('> models a working gate. `unsafe` is therefore 0 **by construction** and is not evidence about');
md.push('> the shipped gate. Retrieval quality is P3/P4 work.');
md.push('');
md.push('| field | value |');
md.push('| --- | --- |');
md.push(`| command | \`node tooling/market/run-market.mjs --seed ${report.seed} --rung ${report.rung}\` |`);
md.push(`| data_mode | \`${report.data_mode.mode}\` (held-out read: ${report.data_mode.heldOutRead}; gold set read: ${report.data_mode.goldSetRead}; embedder used: ${report.data_mode.embedderUsed}) |`);
md.push(`| commit SHA | \`${report.git.sha}\` on \`${report.git.branch}\` |`);
md.push(`| decision digest | \`${report.digest}\` |`);
md.push(`| N | ${report.traffic.totalMessages} messages, **${report.traffic.distinctMessages} distinct**, ${report.traffic.tickets} tickets, ${report.traffic.procedures} procedures |`);
md.push('');
md.push('## Totals (distinct-message denominator)');
md.push('');
md.push('| metric | count |');
md.push('| --- | --- |');
md.push(`| answered | ${report.totals.answered} |`);
md.push(`| escalated | ${report.totals.escalated} |`);
md.push(`| **unsafe** | **${report.totals.unsafe}** (by construction — see the note above) |`);
md.push(`| false escalation | ${report.totals.falseEscalation} |`);
md.push(`| correct | ${report.totals.correct} |`);
md.push(`| distinct messages | ${report.totals.distinctMessages} |`);
md.push('');
md.push('## Per language');
md.push('');
md.push('| language | messages | distinct | answered | escalated | unsafe |');
md.push('| --- | ---: | ---: | ---: | ---: | ---: |');
for (const r of report.tables.perLanguage) {
  md.push(`| ${r.language} | ${r.messages} | ${r.distinct} | ${r.answered} | ${r.escalated} | ${r.unsafe} |`);
}
md.push('');
md.push('## Chaos events');
md.push('');
md.push('| event | expected | observed | safe |');
md.push('| --- | --- | --- | --- |');
for (const c of report.chaos) {
  md.push(`| ${c.id} | ${c.expected} | ${c.observed} | ${c.safe ? 'yes' : '**NO**'} |`);
}
md.push('');
md.push('## Invariants');
md.push('');
md.push('| invariant | ok | detail |');
md.push('| --- | --- | --- |');
for (const i of report.invariants) {
  md.push(`| ${i.name} | ${i.ok ? 'yes' : '**NO**'} | ${i.detail} |`);
}
md.push('');
md.push(`Verdict: **${failed.length === 0 ? 'PASS' : `FAIL (${failed.length})`}**.`);
md.push('');
md.push('Determinism: the same seed twice gives byte-identical output **on this machine and tree**.');
md.push('Cross-machine determinism is **not** proven — it was not tested.');
md.push('');

const mdPath = resolve(reportsDir, `${report.label}.md`);
writeFileSync(mdPath, md.join('\n'), 'utf8');

// --------------------------------------------------------------------- stdout ---

process.stdout.write(`market twin — rung ${report.rung}, seed ${report.seed}\n`);
process.stdout.write(`  messages ${report.traffic.totalMessages} (distinct ${report.traffic.distinctMessages}), tickets ${report.traffic.tickets}, procedures ${report.traffic.procedures}\n`);
process.stdout.write(`  answered ${totals.answered} · escalated ${totals.escalated} · unsafe ${totals.unsafe} · false-escalation ${totals.falseEscalation} · correct ${totals.correct}\n`);
process.stdout.write(`  chaos ${chaos.filter((c) => c.safe).length}/${chaos.length} safe\n`);
process.stdout.write(`  invariants ${checks.filter((c) => c.ok).length}/${checks.length}\n`);
process.stdout.write(`  digest ${report.digest}\n`);
process.stdout.write(`  wrote ${jsonPath.replace(`${ROOT}/`, '')}\n`);
process.stdout.write(`  wrote ${mdPath.replace(`${ROOT}/`, '')}\n`);

if (failed.length > 0) {
  process.stdout.write(`\nFAILED invariants:\n`);
  for (const name of failed) process.stdout.write(`  - ${name}\n`);
  process.exit(1);
}
process.stdout.write('\nMARKET TWIN SMOKE OK\n');
process.exit(0);
