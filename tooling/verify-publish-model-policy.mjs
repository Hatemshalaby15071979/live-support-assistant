#!/usr/bin/env node
/**
 * The server half of the model-integrity fix.
 *
 * `supabase/functions/publish-bundle/index.ts` used to build its manifest model
 * like this:
 *
 *     const model = {
 *       id: 'Xenova/all-MiniLM-L6-v2',
 *       revision: '751bff37182d3f1213fa05d7196b954e230abad9',
 *       quantization: 'q8',
 *       dimensions: 384,
 *       ...(typeof body.model === 'object' && body.model !== null ? (body.model as object) : {}),
 *     };
 *
 * so any authenticated publisher could sign a bundle naming a model the tenant's
 * devices do not have. The client had no check either, so it installed, and every
 * passage was scored against the wrong embedding space.
 *
 * The first case below runs that removed expression verbatim and asserts it
 * produces a divergent model — the counterexample, kept so the defect cannot be
 * dismissed as theoretical. The rest exercise `resolvePublishModel`, which
 * replaced it.
 *
 * The last case is a source assertion. The policy module is only load-bearing if
 * the edge function actually calls it, and nothing else in the suite would notice
 * if the spread were reintroduced beside the call.
 *
 * Run after `pnpm build` (it needs nothing else):
 *     node tooling/verify-publish-model-policy.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PUBLISHED_MODEL, resolvePublishModel } from '../supabase/functions/publish-bundle/model-policy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const checks = [];

function record(name, expected, observed, ok) {
  checks.push({ name, expected: String(expected), observed: String(observed), ok });
}

function expect(name, expected, observed) {
  record(name, expected, observed, expected === observed);
}

function expectTrue(name, condition, detail = '') {
  record(name, 'true', condition ? 'true' : `false ${detail}`, condition === true);
}

// ---------------------------------------------------------------------------
// The removed behaviour, run verbatim. This is the counterexample.
// ---------------------------------------------------------------------------

/** Exactly the spread the edge function used before this fix. */
function oldMerge(bodyModel) {
  return {
    id: 'Xenova/all-MiniLM-L6-v2',
    revision: '751bff37182d3f1213fa05d7196b954e230abad9',
    quantization: 'q8',
    dimensions: 384,
    ...(typeof bodyModel === 'object' && bodyModel !== null ? bodyModel : {}),
  };
}

const oldDivergent = oldMerge({ id: 'Xenova/bge-small-en-v1.5', revision: 'ea104dacec62c0de699686887e3f920caeb4f3e3', dimensions: 384, quantization: 'q8' });

expectTrue(
  'the removed spread did produce a divergent model',
  oldDivergent.id !== PUBLISHED_MODEL.id && oldDivergent.revision !== PUBLISHED_MODEL.revision,
  JSON.stringify(oldDivergent),
);
expect('the removed spread signed a bundle naming the caller\'s model', 'Xenova/bge-small-en-v1.5', oldDivergent.id);

// ---------------------------------------------------------------------------
// The replacement.
// ---------------------------------------------------------------------------

const omitted = resolvePublishModel(undefined);
expectTrue('an omitted model resolves', omitted.ok === true, JSON.stringify(omitted));
expect('an omitted model resolves to the published one', PUBLISHED_MODEL.id, omitted.ok ? omitted.model.id : '(not ok)');

const nulled = resolvePublishModel(null);
expectTrue('an explicit null resolves', nulled.ok === true, JSON.stringify(nulled));

const empty = resolvePublishModel({});
expectTrue('an empty object resolves', empty.ok === true, JSON.stringify(empty));

const restated = resolvePublishModel({ ...PUBLISHED_MODEL });
expectTrue('restating the published model resolves', restated.ok === true, JSON.stringify(restated));

const partialAgreement = resolvePublishModel({ id: PUBLISHED_MODEL.id });
expectTrue('a partial agreement resolves', partialAgreement.ok === true, JSON.stringify(partialAgreement));

// The divergence the old spread allowed, now refused.
const divergent = resolvePublishModel({
  id: 'Xenova/bge-small-en-v1.5',
  revision: 'ea104dacec62c0de699686887e3f920caeb4f3e3',
});
expectTrue('a divergent model is refused', divergent.ok === false, JSON.stringify(divergent));
expect('a divergent model is refused with 400', 400, divergent.ok ? '(ok)' : divergent.status);
expectTrue(
  'the refusal names the disagreeing fields',
  divergent.ok === false && divergent.error.includes('id') && divergent.error.includes('revision'),
  divergent.ok ? '(ok)' : divergent.error,
);

// Each field independently, because a check that compares only `id` would pass
// every case above and miss a manifest that differs only in vector width.
for (const [field, wrong] of [
  ['id', 'Xenova/other-model'],
  ['revision', 'main'],
  ['quantization', 'fp32'],
  ['dimensions', 768],
]) {
  const result = resolvePublishModel({ [field]: wrong });
  expectTrue(
    `a ${field} mismatch is refused`,
    result.ok === false && result.status === 400,
    JSON.stringify(result),
  );
}

// A branch where a commit sha belongs is the specific mistake the embedder spec
// warns about: `main` silently re-pins the corpus.
const branchRevision = resolvePublishModel({ revision: 'main' });
expectTrue(
  'a branch revision is refused in favour of a commit sha',
  branchRevision.ok === false && branchRevision.error.includes('revision'),
  JSON.stringify(branchRevision),
);

for (const [label, value] of [
  ['a string', 'Xenova/all-MiniLM-L6-v2'],
  ['a number', 384],
  ['an array', [{ id: PUBLISHED_MODEL.id }]],
  ['a boolean', true],
]) {
  const result = resolvePublishModel(value);
  expectTrue(`${label} as model is refused`, result.ok === false && result.status === 400, JSON.stringify(result));
}

// The caller never supplies the value. Even when it restates the server's model
// exactly, the object that reaches the manifest is the server's own.
const restatedModel = resolvePublishModel({ ...PUBLISHED_MODEL });
expectTrue(
  'the resolved model is the server constant, not the caller object',
  restatedModel.ok === true && restatedModel.model === PUBLISHED_MODEL,
  restatedModel.ok ? String(restatedModel.model === PUBLISHED_MODEL) : '(not ok)',
);

// ---------------------------------------------------------------------------
// The edge function must actually call it.
// ---------------------------------------------------------------------------

const functionSource = readFileSync(resolve(root, 'supabase/functions/publish-bundle/index.ts'), 'utf8');

expectTrue(
  'the edge function imports the policy',
  functionSource.includes('resolvePublishModel'),
  '(no reference)',
);
expectTrue(
  'the edge function no longer spreads body.model into the manifest',
  !/\.\.\.\s*\(\s*typeof\s+body\.model/.test(functionSource) && !/\.\.\.\s*body\.model/.test(functionSource),
  '(the old spread is still present)',
);
expectTrue(
  'the edge function has no inline model literal left',
  !functionSource.includes("id: 'Xenova/all-MiniLM-L6-v2'"),
  '(the hardcoded model is still inline)',
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const width = {
  name: Math.max(...checks.map((check) => check.name.length), 5),
  expected: Math.max(...checks.map((check) => check.expected.length), 8),
};

console.log('');
console.log(
  `${'CHECK'.padEnd(width.name)}  ${'EXPECTED'.padEnd(width.expected)}  ${'OBSERVED'.padEnd(width.expected)}  RESULT`,
);
console.log('-'.repeat(width.name + width.expected * 2 + 16));

for (const check of checks) {
  console.log(
    `${check.name.padEnd(width.name)}  ${check.expected.padEnd(width.expected)}  ${check.observed.padEnd(width.expected)}  ${check.ok ? 'PASS' : 'FAIL'}`,
  );
}

const failures = checks.filter((check) => !check.ok).length;

console.log('');
console.log(`checks: ${checks.length}  failures: ${failures}`);
console.log('');
console.log(failures === 0 ? 'PUBLISH MODEL POLICY OK' : 'PUBLISH MODEL POLICY FAILED');

process.exit(failures === 0 ? 0 : 1);
