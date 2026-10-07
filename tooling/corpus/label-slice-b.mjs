#!/usr/bin/env node
/**
 * Surface the T04/T05 procedures that could answer each owner-supplied row.
 *
 * This does **not** label. It retrieves candidates so a human — or the agent
 * acting as one — can read the actual document and decide. Labelling from a
 * keyword score would be labelling the retriever, which is the thing being
 * tested.
 *
 * Two independent passes are required by the protocol, and they must be
 * genuinely independent rather than the same method run twice:
 *
 *   - **Pass A** ranks by token overlap (lexical).
 *   - **Pass B** ranks by phrase containment in the procedure's opening
 *     paragraphs (positional).
 *
 * Where they agree, the row is `agent-agreed`. Where they disagree, the row is
 * excluded rather than adjudicated by a third opinion, because a third opinion
 * from the same agent is not independent.
 *
 * Usage:
 *     node tooling/corpus/label-slice-b.mjs            # all rows
 *     node tooling/corpus/label-slice-b.mjs OD-04      # one row
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const TENANT = 'T04-customer-support-style';

const rows = JSON.parse(readFileSync(resolve(here, 'slice-b-owner-rows.json'), 'utf8')).rows;
const corpus = JSON.parse(readFileSync(resolve(here, `tenants/${TENANT}.json`), 'utf8'));

/** Words that carry no signal for matching, in English. */
const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'of', 'to', 'in', 'on', 'for', 'with', 'is', 'are',
  'was', 'were', 'be', 'been', 'am', 'i', 'my', 'me', 'you', 'your', 'it', 'its', 'this', 'that',
  'can', 'cant', 'cannot', 'do', 'does', 'did', 'how', 'why', 'what', 'when', 'where', 'which',
  'not', 'no', 'so', 'from', 'at', 'by', 'as', 'have', 'has', 'had', 'will', 'would', 'should',
  'get', 'got', 'want', 'need', 'please', 'thanks', 'again', 'still', 'now', 'later', 'only',
]);

/** @param {string} text */
function tokenise(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP.has(token));
}

/** Pass A — lexical overlap. */
function passA(query, procedures) {
  const queryTokens = new Set(tokenise(query));
  return procedures
    .map((procedure) => {
      const text = `${procedure.title} ${procedure.summary}`;
      const tokens = new Set(tokenise(text));
      let overlap = 0;
      for (const token of queryTokens) if (tokens.has(token)) overlap += 1;
      return { procedure, score: overlap / (queryTokens.size || 1) };
    })
    .sort((left, right) => right.score - left.score);
}

/** Pass B — phrase containment in the opening paragraphs. */
function passB(query, procedures) {
  const queryTokens = tokenise(query);
  // Bigrams carry more signal than single tokens for a positional pass.
  const bigrams = [];
  for (let index = 0; index + 1 < queryTokens.length; index += 1) {
    bigrams.push(`${queryTokens[index]} ${queryTokens[index + 1]}`);
  }

  return procedures
    .map((procedure) => {
      const opening = procedure.summary.split('\n\n').slice(0, 3).join(' ').toLowerCase();
      let hits = 0;
      for (const bigram of bigrams) if (opening.includes(bigram)) hits += 1;
      let unigrams = 0;
      for (const token of queryTokens) if (opening.includes(token)) unigrams += 1;
      return { procedure, score: hits * 3 + unigrams };
    })
    .sort((left, right) => right.score - left.score);
}

// ---------------------------------------------------------------------------

const requested = process.argv.slice(2);
const selected = requested.length === 0 ? rows : rows.filter((row) => requested.includes(row.id));

for (const row of selected) {
  const a = passA(row.text, corpus.sops).slice(0, 4);
  const b = passB(row.text, corpus.sops).slice(0, 4);

  console.log('');
  console.log(`=== ${row.id}  ${row.text}`);
  console.log('');
  console.log('  pass A (lexical)                     pass B (positional)');
  const width = 46;
  for (let index = 0; index < 4; index += 1) {
    const left = a[index];
    const right = b[index];
    const leftText = left === undefined ? '' : `${left.score.toFixed(2)} ${left.procedure.source_path.split('/').slice(-1)[0]}`;
    const rightText = right === undefined ? '' : `${right.score.toFixed(0)} ${right.procedure.source_path.split('/').slice(-1)[0]}`;
    console.log(`  ${leftText.padEnd(width)}${rightText}`);
  }
  console.log('');
  console.log('  top candidate title  :', a[0]?.procedure.title ?? '(none)');
  console.log('  top candidate source :', a[0]?.procedure.source_path ?? '(none)');
  console.log('  top candidate text   :', (a[0]?.procedure.summary ?? '').slice(0, 200).replace(/\s+/g, ' '));
}

console.log('');
console.log(`${selected.length} row(s) surfaced from ${corpus.sops.length} T04 procedures.`);
console.log('Labelling is a separate, deliberate step — see the protocol note at the top of this file.');
