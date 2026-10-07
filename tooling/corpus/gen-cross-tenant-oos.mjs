#!/usr/bin/env node
/**
 * Generate cross-tenant out_of_scope rows by construction (g14, slice (i)).
 *
 * For every answerable row whose answer lives in tenant X, emit an `out_of_scope`
 * row for each of the OTHER two tenants. By KNOWN_ISSUES.md §11, `out_of_scope`
 * is tenant-scoped: the answer document is structurally absent from the target
 * tenant's corpus, so a well-functioning retriever+gate must refuse it. These are
 * "easy-mode" because the answer is not merely unlikely — it is not in the corpus.
 *
 * Construction, not invention: the source text is an existing answerable row, so
 * no new answerable material is created. `label_source = construction`.
 *
 * Run after `assemble-questions.mjs` has produced `questions.json`:
 *     node tooling/corpus/gen-cross-tenant-oos.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const TENANTS = {
  'T01-platform-operations-style': { short: 'T01', about: 'the Kubernetes tasks tree' },
  'T04-customer-support-style': { short: 'T04', about: 'GitHub account-and-billing technical documentation' },
  'T05-policy-style': { short: 'T05', about: 'GitHub site-policy and terms' },
};

const q = JSON.parse(readFileSync(resolve(here, 'questions.json'), 'utf8'));
const answerable = q.questions.filter((r) => r.label === 'answerable' && r.acceptable_documents?.length > 0);

const rows = [];
for (const src of answerable) {
  const srcTenant = TENANTS[src.tenant];
  if (srcTenant === undefined) continue;
  for (const [target, meta] of Object.entries(TENANTS)) {
    if (target === src.tenant) continue;
    rows.push({
      id: `XO-${meta.short}-from-${src.id}`,
      tenant: target,
      text: src.text,
      reason:
        `Cross-tenant OOS (easy-mode): the answer to this question lives in ${srcTenant.about}; ` +
        `${meta.about} does not contain it, so it is out_of_scope for ${meta.short} specifically.`,
      label_source: 'construction',
      easy_mode: true,
    });
  }
}

const output = {
  note:
    'Cross-tenant out_of_scope rows, constructed from existing answerable rows (g14 slice i). ' +
    'Each row is an answerable question from one tenant, relabelled out_of_scope for the other two ' +
    'tenants. label_source = construction; all rows are easy-mode (answer document absent from the ' +
    'target corpus). Never counted as validated ground truth.',
  origin: 'derived-style',
  data_mode: 'simulated',
  label_basis:
    'construction: the source question is answerable in its own tenant; the target tenant does not ' +
    'contain the source document, so it is out_of_scope for the target by KNOWN_ISSUES.md §11.',
  rows,
};

writeFileSync(resolve(here, 'slice-c-cross-tenant-oos.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');

const perTenant = {};
for (const r of rows) perTenant[r.tenant] = (perTenant[r.tenant] ?? 0) + 1;
console.log(`cross-tenant OOS generated: ${rows.length}`);
for (const [t, n] of Object.entries(perTenant)) console.log(`  ${t.padEnd(32)} ${n}`);
console.log(`  source answerable rows: ${answerable.length}`);
