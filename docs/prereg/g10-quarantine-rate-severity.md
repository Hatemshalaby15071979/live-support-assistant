# Prereg — count only high-severity findings toward the source-drop rate

**Zone.** Y (a threshold on the corpus gate — V2 §2.2).
**Date.** 2026-10-07.
**Status.** registered before the run. Immutable after the run; a later change of rule requires a
new prereg and this one marked `superseded`.
**Owner decision.** APPROVED 2026-10-07, with conditions. The conditions are binding and are
restated in §6.

---

## Hypothesis

The 5% source-level drop rate is meant to answer "is this source full of incidental personal data".
It currently counts findings of **every** severity, including `review`-severity ones that a human
looking at the document would judge intentional. On small sources the arithmetic then decides the
outcome: `django-faq-en` has 8 documents, so one finding is 12.5%, and a single deliberately
published contact address drops the entire source.

Counting only `high`-severity findings toward the rate will keep the rule doing its job on real
personal data while stopping it from discarding legitimate sources over published contact details
and contributor credits.

## What changes, and what does not

| | Before | After |
| --- | --- | --- |
| **Source drop rule** | any finding counts toward the 5% rate | only `high`-severity findings count |
| **Item quarantine** | any finding quarantines the item | **unchanged — any finding still quarantines the item** |
| **Corpus membership** | quarantined items are excluded | **unchanged — quarantined items stay excluded** |
| **Manifest record** | findings recorded with pattern and severity | **unchanged, plus a per-severity rate** |

**The only thing that changes is whether a whole source is discarded.** A `review`-severity finding
still removes its document from the corpus. `from Ulf Bartelt` will still not be served. What it
will no longer do is take eleven other documents down with it.

This distinction is the entire content of the change and is the thing to check first in review: a
relaxation of the *item* rule would be a different and much larger change, and it is not this one.

## Metric

1. Per source: `quarantine_rate_high` (high-severity items ÷ items considered) and
   `quarantine_rate_any` (any finding ÷ items considered), both reported.
2. Per source: `status` — `harvested` or `dropped`.
3. Items in the corpus before and after.
4. Planted-PII recall (see §5) before and after.

## Dataset

The registered sources in `tooling/corpus/sources.json`, at their pinned refs. Not a sample and not
a split — the whole registry, because the question is what the rule does to the sources that exist.

## Accept rule

All four must hold:

1. The planted-PII recall test (§5) is **≥ 95%**, measured after the change.
2. Every source that was `harvested` before the change is still `harvested`, **or** the reason it is
   not is a high-severity rate above 5%.
3. **No item that was quarantined before the change is in the corpus after it.** This is the
   condition that makes the change safe, and it is checked by comparing the item sets directly
   rather than by reasoning about the rule.
4. `pnpm run verify` stays green.

## Reject rule

Any of these rejects the change and the branch is kept with the result logged:

1. Planted-PII recall falls below 95%.
2. Any quarantined item appears in the corpus after the change — the item rule was altered by
   accident.
3. A source is harvested whose high-severity rate exceeds 5%.
4. Any suite in `pnpm run verify` fails or changes verdict.

## 5. Planted-PII recall — the condition that makes this safe

Relaxing a rate is exactly the kind of change that quietly reduces detection. So detection is
measured directly and separately from the rate:

- **≥ 30 planted strings** across the categories the gate claims: email, international phone,
  national phone, postal address, account identifier, honorific name, labelled contact name,
  SSN-shaped.
- **Mixed languages**: English, Spanish, Portuguese, French — the languages the corpus actually
  carries.
- Each planted string is inserted into a **sample document** and the gate is run over the result.
- **Recall = caught ÷ planted.** The gate must catch **≥ 95%**.
- The test reports **which** strings were missed, by category and by language, so a miss is
  diagnosable rather than a number.

Recall is measured on the **item** rule, which this change does not touch. A drop here would mean
the change reached further than it says.

## 6. Owner conditions (binding)

1. The prereg is written and committed **before** any re-run. ✅ this document.
2. A planted-PII recall test of ≥ 30 strings, ≥ 95% caught, the number reported, **fixed before
   moving on** if it misses.
3. The Kubernetes localised pages must be checked for a real English counterpart in the corpus
   before any language comparison is published, and the comparison labelled
   **"different content, not parity"** where the match rate is low.
4. Sources are labelled **"technical documentation analogues"**, never "support procedures", and a
   source closer to customer-support or policy style is added.
5. The stale pnpm lock behind B2–B7 is root-caused, or the blocker is named.

## What is published either way

- **Accepted:** `docs/CORPUS_PROVENANCE.md` §3 rewritten with the per-severity rates, the recall
  number, and the item-set comparison; `DECISIONS.md` entry.
- **Rejected:** an entry in the rejected-experiment register naming which accept condition failed,
  with the observed values. A rejection here is a real finding: it would mean the rate and the
  detection are coupled, and the threshold cannot be moved without moving detection with it.

## Rollback

One expression in `tooling/corpus/pii-gate.mjs` (`quarantineRate` counts findings of every severity)
and one call site in `harvest.mjs`. No snapshot, manifest or corpus file depends on the rule, so
rollback is a code revert plus a re-harvest — the snapshots are content-addressed and unchanged by
this decision.
