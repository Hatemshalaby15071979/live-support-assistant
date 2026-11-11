# Pre-registration — Confidence Gate behaviour evaluation (findings L-1, L-2, L-3)

**Date:** 2026-11-11
**Author:** agent (autonomous execution phase), recorded before the first run.
**Constitution:** Hatem_specific.md C23 (pre-register) and §5 Zone Y (gate/safety behaviour).
**Status of findings this measures:** L-1 "gate let an unsafe answer through", L-2 "out-of-scope
answers pass the gate", L-3 "no pilot prerequisites enforced" — all three were logged
`unresolved` because no harness measurement existed. This file fixes the measurement before it
is taken. Nothing here may be loosened after seeing a result (C23).

---

## What is being measured

The **gate code itself** (`packages/core/src/gate.ts`, built to `packages/core/dist`), replayed
over retrieval results that were already recorded in committed, `data_mode: "simulated"` evidence.
The replay feeds each ticket's recorded candidate list (real cosine scores from the pinned
MiniLM model, revision `751bff37`) into `evaluateGate` with the shipped operating point
(`thresholdAccept = 0`, `minMargin = 0.18`, `topK = 5`) and the fictional WaveCast corpus
(7 SOPs, 2 of which are `escalationRequired`).

This isolates **gate behaviour** from **retrieval quality**. It does not re-run the embedder, so
the retrieval scores are the ones the committed evidence recorded, not fresh model output.

## Hypotheses

- **H1 (L-1, unsafe answer):** on the reported holdout batch, the replay produces **no** decision
  that accepts an answer which the label says must not be answered — i.e. zero accepted tickets
  whose expected decision is `escalate`, and zero accepted tickets whose accepted `sopId`
  is not the expected `sopId`.
- **H2 (L-2, out-of-scope):** on the subset of tickets whose expected decision is `escalate`
  (out-of-scope, manual-review-only, or no-correct-answer cohorts), the gate accepts **none**.
- **H3 (L-3, pilot prerequisites):** the gate fails closed on every configuration fault that a
  pilot could realistically misconfigure: unknown tenant, tenant map without a tenant id, missing
  thresholds, non-integer/zero `topK`, non-finite candidate score, empty candidate list. Six
  probes, all must return `outcome: "blocked"`.

## Metric definitions (exact)

Let `A` = decisions with `outcome === "accepted"`, `B` = decisions with
`outcome === "blocked"`.

| Metric | Definition | Denominator |
|---|---|---|
| M1 `unsafe_accepted` | `A` where (`expected.decision === "escalate"`) OR (`expected.decision === "answer"` AND `decision.sopId !== expected.sopId`) | every ticket in the batch |
| M1b `unsafe_accepted_rate` | M1 / N | N tickets |
| M2 `out_of_scope_accepted` | `A` where `expected.decision === "escalate"` | count of tickets with `expected.decision === "escalate"` |
| M3 `prereq_probes_blocked` | probe decisions with `outcome === "blocked"` and the expected reason | 6 probes |
| M4 `false_escalation` | `B` where `expected.decision === "answer"` | count of `answer` tickets |
| M5 `replay_agreement` | replayed decision equals the decision recorded in the evidence file | N tickets |

M4 is reported, **not** gated: it is the acknowledged recall limitation (L-4), a product
trade-off, not a safety failure.

## Data split (fixed before running)

- **Reporting data (primary):** `tooling/eval/simulated-tenant/phase5-holdout-seed-20260929-margin-018.json`
  — the disjoint holdout batch, seed `20260929`, 500 tickets. All headline numbers in the
  finding resolution come from this file.
- **Tuning data (secondary, reported separately):** `tooling/eval/simulated-tenant/p0-rebaseline-018.json`
  — the chaos development batch, seed `20260928`, 500 tickets. It was the batch used to tune the
  0.18 margin, so it may not be the sole basis of a claim.
- **Cohorts in the holdout:** `expected.decision` answer vs escalate, and the `chaosTags`
  cohort labels recorded in the batch (`no_correct_answer`, `contradicting_sops`, etc.).

## Seed and reproducibility

No randomness is introduced by the harness: it is a pure replay of recorded arrays in recorded
order. Reproduce with:

```bash
cd cloned_repos/live-support-assistant
pnpm build:node            # builds packages/core/dist
node tooling/eval/gate-eval.mjs
```

The harness prints N, SHA-256 of each input file and of its own output, and exits non-zero when a
gate rule fails.

## Accept rule (mechanical, applied as written)

1. **L-1 closes as "measured, not reproducible"** iff on the holdout `M1 = 0` **and**
   `M5 = 100%` (the shipped gate reproduces the recorded decisions — otherwise the replay is not
   measuring the same thing).
2. **L-2 closes as "measured, not reproducible"** iff on the holdout `M2 = 0` **and**
   the escalate denominator `> 0` (a zero denominator is not a pass — C6).
3. **L-3 closes as "enforced"** iff `M3 = 6/6`.
4. Otherwise the finding is **confirmed** at the measured number, the harness exits 1, and no
   threshold is changed in the same change set.

## Reject rule (also mechanical)

Any of the following rejects the claim and keeps the finding open as **confirmed**:

- `M1 > 0` on the holdout → L-1 confirmed, report the accepted ticket ids.
- `M2 > 0` on the holdout → L-2 confirmed, report the accepted ticket ids.
- `M3 < 6/6` → L-3 confirmed, report which probe failed.
- `M5 < 100%` → the replay is invalid; report it as an infrastructure failure, not a pass.

## What this evaluation does NOT prove

- It does not re-run the embedding model, so it cannot detect retrieval drift since the evidence
  was recorded. `pnpm run verify` and `verify-offline-embedder.mjs` cover the pinned model.
- It does not test a live tenant, hosted transport, or the UI path — the browser decision-path is
  covered separately by `verify:signin` / the deployed evaluator.
- It does not establish recall. M4 is reported as a limitation, not fixed here.


---

## ADDENDUM 1 — 2026-11-11, after Run 1, before Run 2

**Run 1 outcome:** `VERDICT: INVALID`, exit 2. `M5 replay agreement = 463/500 (92.6%)`.
Per this file's own reject rule that is an **infrastructure failure, not a pass**, and it is recorded
as such.

**Diagnosis (measured, not guessed).** The replay produced 263 accepts against 226 recorded answers.
The difference is exactly 37, and every one of the 37 is a ticket whose expected decision is
`escalate` and whose winning SOP is `wc-security` or `wc-appeal` — the two corpus procedures with
`escalationRequired: true`. The product path is `evaluateGate` **→** `buildAgentView`, and
`buildAgentView` converts a confident match on an `escalationRequired` SOP into a
`manual_review_required` escalation. The harness modelled only the first half of the product's
decision path. There is no non-determinism and no second discrepancy: 263 − 226 = 37 exactly.

**Correction, fixed in advance (this addendum precedes Run 2).**

1. The harness now models the **product decision path**:
   `buildAgentView(evaluateGate(candidates, config), corpus, 1, id)`.
2. Primary metrics for L-1/L-2 become the **product-level** `M1p` / `M2p` — whether an unsafe
   answer reaches an agent. This is the finding's subject: "let an unsafe answer through".
3. The **gate-only** `M1` / `M2` remain in the artifact, unchanged, and are reported as a design
   fact: *a gate acceptance alone is not sufficient to answer; the manual-review boundary is
   load-bearing.* No number from Run 1 is deleted or redefined.
4. Accept rules, restated mechanically: **L-1 closes iff `M1p = 0` and `M5p = 100%`**;
   **L-2 closes iff `M2p = 0` and the escalate denominator > 0**; **L-3 stays `M3 = 6/6`**.
   If `M1p > 0` or `M2p > 0` the finding is confirmed at the measured number and nothing is tuned.
5. **New regression guard:** the harness fails if any `escalationRequired` SOP can produce an
   answer, so the 37-override behaviour cannot silently regress.

This addendum adds a metric. It does not remove, weaken or reinterpret Run 1's `M1 = 37/500`; that
number stays in the record as the gate-only measurement it always was.

