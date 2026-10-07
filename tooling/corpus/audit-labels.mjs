#!/usr/bin/env node
/**
 * Automated label audit over the 15 owner-supplied rows.
 *
 * ## What this is, and what it is not
 *
 * It is an **automated evidence audit**. It reads the T04 corpus and reports
 * whether each proposed label is supported by text that actually exists.
 *
 * It is **NOT** an owner spot-check and it does **not** validate a label. The
 * distinction matters: an automated check that a document contains the answer
 * confirms the *document*, not that a human would agree the document is the
 * right one. It cannot find a label that is wrong in a way the corpus cannot
 * see — a question answered by two documents where the labelled one is the worse
 * match, for instance, is flagged AMBIGUOUS here and might be plainly wrong to
 * a reader.
 *
 * ## Why out_of_scope needs more than one search
 *
 * An earlier pass labelled five rows `out_of_scope` on the strength of a single
 * targeted search returning nothing. **Absence of evidence from one query is not
 * evidence of absence**, and the failure mode is silent: a query with the wrong
 * words finds nothing and looks exactly like a corpus with no answer.
 *
 * So every row carries **several independent term sets**, and an `out_of_scope`
 * verdict requires that *every* strategy comes back below the floor. The audit
 * prints the best score each strategy found, so a reader can see the search was
 * real rather than assume it.
 *
 * ## What it does not touch
 *
 * It reads `questions.json` and the tenant corpus. It writes only its own
 * report. Labels are not altered, the corpus is not modified, and no row is
 * excluded.
 *
 * Usage:
 *     node tooling/corpus/audit-labels.mjs
 *     node tooling/corpus/audit-labels.mjs --json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const TENANT = 'T04-customer-support-style';

/** A document must reach this share of the best strategy's terms to count as a match. */
const MATCH_FLOOR = 0.34;

/** Within this ratio of the top score, a competitor makes the row AMBIGUOUS. */
const COMPETITOR_RATIO = 0.8;

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are',
  'was', 'were', 'be', 'been', 'am', 'i', 'my', 'me', 'you', 'your', 'it', 'its', 'this', 'that',
  'can', 'cant', 'cannot', 'do', 'does', 'did', 'how', 'why', 'what', 'when', 'where', 'which',
  'not', 'no', 'so', 'from', 'at', 'by', 'as', 'have', 'has', 'had', 'will', 'would', 'should',
  'get', 'got', 'want', 'need', 'please', 'thanks', 'again', 'still', 'now', 'later', 'only',
]);

/** @param {string} text */
function words(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP.has(word));
}

/**
 * Several independent term sets per row.
 *
 * This is the part that makes the `out_of_scope` verdicts meaningful. Each set is
 * a different way a document might phrase the same idea, so a corpus that answers
 * the question but uses different words still shows up in at least one strategy.
 */
const STRATEGIES = {
  'OD-01': [
    ['blacklist', 'blacklisted', 'banned', 'suspended', 'locked', 'disabled', 'restricted'],
    ['log', 'login', 'sign', 'access', 'account', 'unlock'],
  ],
  'OD-02': [
    ['username', 'change', 'rename', 'available'],
    ['username', 'reference', 'profile'],
  ],
  'OD-03': [
    ['verification', 'verify', 'code', 'otp', 'one', 'time', 'password'],
    ['email', 'address', 'verify', 'verification', 'send'],
  ],
  'OD-04': [
    ['payment', 'method', 'card', 'update', 'change', 'replace'],
    ['billing', 'payment', 'info', 'credit', 'card'],
  ],
  'OD-05': [
    ['card', 'delete', 'remove', 'expired', 'expire'],
    ['payment', 'method', 'card', 'remove'],
  ],
  'OD-06': [
    ['marketing', 'unsubscribe', 'opt', 'out', 'notification', 'preferences'],
    ['sms', 'text', 'message', 'email', 'marketing'],
  ],
  'OD-07': [
    ['invoice', 'pdf', 'download', 'language', 'receipt'],
    ['billing', 'invoice', 'report', 'document'],
  ],
  'OD-08': [
    ['partial', 'payment', 'instalment', 'installment', 'split', 'invoice'],
    ['pay', 'part', 'later', 'invoice', 'due'],
  ],
  'OD-09': [
    ['reset', 'delete', 'close', 'account', 'over', 'zero'],
    ['delete', 'personal', 'account', 'data'],
  ],
  'OD-10': [
    ['freeze', 'suspend', 'deactivate', 'pause', 'temporarily', 'account'],
    ['close', 'account', 'delete', 'downgrade'],
  ],
  'OD-11': [
    ['ban', 'banned', 'appeal', 'reinstate', 'suspended', 'appeals'],
    ['locked', 'account', 'unlock', 'restricted'],
  ],
  'OD-12': [
    ['verification', 'code', 'resend', 'sms', 'phone', 'arrives'],
    ['email', 'verification', 'troubleshooting', 'send'],
  ],
  'OD-13': [
    ['card', 'charge', 'charged', 'payment', 'method', 'new', 'old'],
    ['billing', 'payment', 'info', 'card'],
  ],
  'OD-14': [
    ['unsubscribe', 'email', 'notification', 'opt', 'out', 'marketing'],
    ['email', 'preferences', 'notification'],
  ],
  'OD-15': [
    ['refund', 'charged', 'twice', 'double', 'gift', 'stream', 'live'],
    ['refund', 'payment', 'duplicate', 'charge', 'billing'],
  ],
};

// ---------------------------------------------------------------------------

const questions = JSON.parse(readFileSync(resolve(here, 'questions.json'), 'utf8')).questions;
const corpus = JSON.parse(readFileSync(resolve(here, `tenants/${TENANT}.json`), 'utf8'));

/** Group procedures by source document, so scoring is at document level. */
const documents = new Map();
for (const procedure of corpus.sops) {
  const bucket = documents.get(procedure.source_path) ?? [];
  bucket.push(procedure);
  documents.set(procedure.source_path, bucket);
}

/** Every distinct term any strategy uses — the vocabulary IDF is computed over. */
const ALL_TERMS = [...new Set(Object.values(STRATEGIES).flat(2))];

/**
 * Inverse document frequency for every term in the corpus.
 *
 * The first version scored a document by the *share* of query terms it contains,
 * with no weighting. Every long document contains most common terms, so eight
 * rows scored 0.75 or 1.00 together and the audit reported AMBIGUOUS almost
 * everywhere — the scorer could not tell `payment` from `instalment`, and the
 * verdicts said more about document length than about relevance.
 *
 * IDF is what separates a term that narrows a search from one that does not.
 * `payment` appears in most billing documents and contributes almost nothing;
 * `instalment` appears in none and, if it appeared, would settle the row.
 *
 * @type {Map<string, number>}
 */
const IDF = new Map();
{
  const documentCount = documents.size;
  const seenIn = new Map();
  for (const [, procedures] of documents) {
    const text = procedures.map((procedure) => `${procedure.title} ${procedure.summary}`).join(' ').toLowerCase();
    const present = new Set();
    for (const term of ALL_TERMS) if (text.includes(term)) present.add(term);
    for (const term of present) seenIn.set(term, (seenIn.get(term) ?? 0) + 1);
  }
  for (const term of ALL_TERMS) {
    const df = seenIn.get(term) ?? 0;
    // Smoothed, so a term in every document still contributes a little rather
    // than zero, and a term in none contributes the maximum.
    IDF.set(term, Math.log((documentCount + 1) / (df + 1)) + 1);
  }
}

/**
 * IDF-weighted coverage: the share of the query's *information* the document
 * contains, not the share of its words.
 *
 * @param {string[]} terms
 * @param {string} text
 */
function scoreTerms(terms, text) {
  const haystack = text.toLowerCase();
  let total = 0;
  let hit = 0;
  for (const term of terms) {
    const weight = IDF.get(term) ?? Math.log(documents.size + 1) + 1;
    total += weight;
    if (haystack.includes(term)) hit += weight;
  }
  return total === 0 ? 0 : hit / total;
}

/**
 * Score every document with one term set, and return the best passage too.
 *
 * @param {string[]} terms
 */
function scoreCorpus(terms) {
  const scored = [];
  for (const [path, procedures] of documents) {
    let best = 0;
    let bestPassage = '';
    for (const procedure of procedures) {
      const text = `${procedure.title}\n${procedure.summary}`;
      const score = scoreTerms(terms, text);
      if (score > best) {
        best = score;
        bestPassage = text;
      }
    }
    scored.push({ path, score: best, passage: bestPassage });
  }
  return scored.sort((left, right) => right.score - left.score);
}

/** A short excerpt around the first term hit. */
function excerpt(passage, terms, length = 190) {
  const flat = passage.replace(/\s+/g, ' ').trim();
  const lower = flat.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const found = lower.indexOf(term);
    if (found !== -1 && (at === -1 || found < at)) at = found;
  }
  if (at === -1) return flat.slice(0, length);
  const from = Math.max(0, at - 60);
  return flat.slice(from, from + length);
}

// ---------------------------------------------------------------------------

const audit = [];

for (const row of questions) {
  const strategies = STRATEGIES[row.id] ?? [[...new Set(words(row.text))]];
  const proposed = row.acceptable_documents ?? [];

  const perStrategy = strategies.map((terms) => ({ terms, ranked: scoreCorpus(terms) }));

  // Best score each strategy found anywhere in the corpus.
  const bestOverall = Math.max(...perStrategy.map((entry) => entry.ranked[0]?.score ?? 0));

  // The proposed document's own best showing across strategies.
  let proposedScore = 0;
  let proposedPassage = '';
  let proposedTerms = strategies[0];
  for (const { terms, ranked } of perStrategy) {
    const hit = ranked.find((entry) => entry.path === proposed[0]);
    if (hit !== undefined && hit.score > proposedScore) {
      proposedScore = hit.score;
      proposedPassage = hit.passage;
      proposedTerms = terms;
    }
  }

  // Competitors: the best-scoring documents that are NOT the proposed one.
  const competitors = [];
  for (const { terms, ranked } of perStrategy) {
    for (const entry of ranked) {
      if (proposed.includes(entry.path)) continue;
      if (entry.score < MATCH_FLOOR) continue;
      if (competitors.some((existing) => existing.path === entry.path)) continue;
      competitors.push({ path: entry.path, score: entry.score, passage: entry.passage, terms });
    }
  }
  competitors.sort((left, right) => right.score - left.score);

  // -------------------------------------------------------------------------
  // Verdict.
  // -------------------------------------------------------------------------

  let verdict;
  let confidence;
  let reason;

  if (row.label === 'out_of_scope') {
    // The bar is deliberately the opposite of the other branch: an absence claim
    // has to survive every strategy, not one.
    if (bestOverall >= MATCH_FLOOR) {
      verdict = 'NOT SUPPORTED';
      confidence = 'high';
      reason =
        `A document reaches ${bestOverall.toFixed(2)} against the floor of ${MATCH_FLOOR}, so the corpus ` +
        'does contain relevant material and the out_of_scope label does not hold.';
    } else {
      verdict = 'SUPPORTED';
      confidence = bestOverall <= MATCH_FLOOR / 2 ? 'high' : 'medium';
      reason =
        `Every one of the ${perStrategy.length} strategies comes back below the floor of ${MATCH_FLOOR}; ` +
        `the best any document reached was ${bestOverall.toFixed(2)}.`;
    }
  } else if (proposed.length === 0) {
    verdict = 'NOT SUPPORTED';
    confidence = 'high';
    reason = 'An answerable label with no proposed document cannot be supported by evidence.';
  } else if (proposedScore < MATCH_FLOOR) {
    verdict = 'NOT SUPPORTED';
    confidence = 'high';
    reason = `The proposed document reaches only ${proposedScore.toFixed(2)} against the floor of ${MATCH_FLOOR}.`;
  } else {
    const topCompetitor = competitors[0];

    if (topCompetitor !== undefined && topCompetitor.score > proposedScore) {
      // A competitor that scores HIGHER than the labelled document is not a tie.
      // The first version of this rule called that "within 20% of it" and
      // returned AMBIGUOUS, which is the wrong direction: it means the label
      // probably names the weaker of two documents.
      verdict = 'NOT SUPPORTED';
      confidence = topCompetitor.score > proposedScore * 1.2 ? 'high' : 'medium';
      reason =
        `A competing document scores ${topCompetitor.score.toFixed(2)} against the proposed document's ` +
        `${proposedScore.toFixed(2)}, so the labelled document is not the best match in the corpus.`;
    } else if (topCompetitor !== undefined && topCompetitor.score >= proposedScore * COMPETITOR_RATIO) {
      verdict = 'AMBIGUOUS';
      confidence = 'medium';
      reason =
        `The proposed document reaches ${proposedScore.toFixed(2)} and a competing document reaches ` +
        `${topCompetitor.score.toFixed(2)}, within ${((1 - COMPETITOR_RATIO) * 100).toFixed(0)}% of it. ` +
        'Both are plausible answers and the label picks one.';
    } else {
      verdict = 'SUPPORTED';
      confidence = proposedScore >= 0.6 ? 'high' : 'medium';
      reason =
        `The proposed document reaches ${proposedScore.toFixed(2)} and no competing document comes within ` +
        `${((1 - COMPETITOR_RATIO) * 100).toFixed(0)}% of it.`;
    }
  }

  // Partial match: the row has two parts and the document only covers one.
  const partial = proposedScore > 0 && proposedScore < 0.6 && row.label === 'answerable';

  audit.push({
    id: row.id,
    question: row.text,
    proposed_label: row.label,
    proposed_documents: proposed,
    strategies: perStrategy.map((entry) => ({
      terms: entry.terms,
      best_score: Number((entry.ranked[0]?.score ?? 0).toFixed(3)),
      best_document: entry.ranked[0]?.path ?? null,
    })),
    best_overall: Number(bestOverall.toFixed(3)),
    proposed_score: Number(proposedScore.toFixed(3)),
    evidence_document: proposed[0] ?? null,
    evidence_excerpt: proposedPassage === '' ? null : excerpt(proposedPassage, proposedTerms),
    competitors: competitors.slice(0, 3).map((entry) => ({
      path: entry.path,
      score: Number(entry.score.toFixed(3)),
      excerpt: excerpt(entry.passage, entry.terms, 140),
    })),
    verdict,
    confidence,
    reason,
    partial_match: partial,
  });
}

// ---------------------------------------------------------------------------

const counts = {
  supported: audit.filter((entry) => entry.verdict === 'SUPPORTED').length,
  not_supported: audit.filter((entry) => entry.verdict === 'NOT SUPPORTED').length,
  ambiguous: audit.filter((entry) => entry.verdict === 'AMBIGUOUS').length,
};

const report = {
  note:
    'AUTOMATED evidence audit. This is NOT an owner spot-check and does not validate a label. It ' +
    'confirms that a document contains the answer, not that a human would agree it is the right ' +
    'document. Labels are unchanged and no row is excluded.',
  generated_at: new Date().toISOString(),
  tenant: TENANT,
  data_mode: 'simulated',
  match_floor: MATCH_FLOOR,
  competitor_ratio: COMPETITOR_RATIO,
  counts,
  rows: audit,
};

writeFileSync(resolve(here, 'label-audit.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log('');
  console.log('AUTOMATED LABEL AUDIT — not an owner spot-check, and not validation');
  console.log('');
  console.log(`  rows ${audit.length}   floor ${MATCH_FLOOR}   competitor ratio ${COMPETITOR_RATIO}`);
  console.log('');

  for (const entry of audit) {
    console.log(`--- ${entry.id}  ${entry.question}`);
    console.log(`    proposed   ${entry.proposed_label}`);
    console.log(`    evidence   ${entry.evidence_document ?? '(none)'}`);
    console.log(`    scores     proposed ${entry.proposed_score.toFixed(2)} | best anywhere ${entry.best_overall.toFixed(2)}`);
    console.log(`    strategies ${entry.strategies.map((s) => s.best_score.toFixed(2)).join(', ')}`);
    if (entry.evidence_excerpt !== null) console.log(`    excerpt    ${entry.evidence_excerpt.slice(0, 160)}`);
    for (const competitor of entry.competitors) {
      console.log(`    competitor ${competitor.score.toFixed(2)}  ${competitor.path.split('/').slice(-1)[0]}`);
    }
    console.log(`    VERDICT    ${entry.verdict} (${entry.confidence})${entry.partial_match ? '  [PARTIAL MATCH]' : ''}`);
    console.log(`    reason     ${entry.reason}`);
    console.log('');
  }

  console.log('SUMMARY');
  console.log(`  supported:     ${counts.supported}`);
  console.log(`  not supported: ${counts.not_supported}`);
  console.log(`  ambiguous:     ${counts.ambiguous}`);
  console.log('');
  console.log('wrote label-audit.json');
  console.log('');
}
