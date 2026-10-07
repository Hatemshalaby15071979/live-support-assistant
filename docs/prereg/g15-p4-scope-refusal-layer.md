# g15 — P4 scope/refusal layer (owner option d)

**Zone.** Y (governance). **Status.** PREREG — written before the run, per the owner's ruling on
`a72ba87` (correction 1) / the option-(d) decision of 2026-10-07. Companion to
`docs/prereg/rejected-experiments.md`.

## Background

The expanded calibration (g14) showed all three tenants serve unsafe at their shipped thresholds
(T01 1, T04 9, T05 3 at 0.68 / 0.53 / 0.61 on the expanded calibration split, OOS N 75/75/81). T05 was
recalibrated to 0.69 (its calibration zero-unsafe point) but still serves 1 unsafe on the new held-out,
so **D1 NOT MET**. Growing evidence (option c) tightened the bound but did not produce a pass.

Four paths were considered for the retrieval-quality limit:

- **(a) new / stronger embedder** — the likely real fix, but a separate experiment (see register RX-03).
- **(b) move T01/T04 to their calibration zero-unsafe points (0.76 / 0.62)** — refuses 83% / 74% of
  answerable traffic; a product cost, rejected.
- **(c) grow OOS further** — repeats g14; the per-tenant held-out N≥300 floor is the real blocker.
- **(d) a P4 scope/refusal layer, refusal-only** — **CHOSEN**.

The cross-encoder reranker stays **CLOSED** (register RX-01). T01/T04 stay at their shipped thresholds
with `calibration_status = fails-calibration`; no move to 0.76/0.62.

## Hypothesis

A lightweight scope/refusal layer that operates on retrieval candidates **before** the gate can reduce
`unsafe` (out_of_scope served) and `wrong-proc` (wrong document served) **without a new embedder**, by
escalating candidates it cannot scope-confidently assign. It does not need to answer; a correct refusal
is the success case.

## Metric (reported together, never in isolation)

- `unsafe` — an `out_of_scope` question the path served (returned a procedure).
- `wrong-proc` — an answerable question served with the wrong document (= `FP − unsafe`).
- `recall` — answerable questions the path still answered; reported as the **loss** vs the gate-alone
  baseline so the refusal cost is explicit.

These three are the D1-relevant joint metric. A change is accepted only if it reduces `unsafe` and
`wrong-proc` without collapsing `recall` below the floor the owner sets before the run.

## Design constraints

- **Refusal-only.** The layer may produce a content-free escalation or pass the candidate to the gate; it
  **never emits procedure text**. This preserves the Phase 4 leak invariant (no procedure content reaches
  the agent on a blocked query) — reuse the leak test in `tooling/gate/verify-gate.mjs`.
- It may escalate on scope uncertainty (e.g., low top-1/runner-up separation, or a tenant-scoped
  `out_of_scope` signal) but must not answer.

## Splits & seeds

- Measure on the **calibration** split (expanded: OOS N T01 75 / T04 75 / T05 81).
  **Validate once** on the **new held-out** (OOS N T01 33 / T04 30 / T05 25); never tune on it.
- **Two fixed seeds:** `20261007` (the corpus split seed) and `20261101` (the layer's own threshold
  search). Results reported per seed and pooled, so the outcome is not an artefact of one seed.
- **Margin band:** `minMargin` swept over {0.10, 0.18, 0.25, 0.35} at each tenant's shipped
  `thresholdAccept`; the layer's refusal threshold swept over a band around the gate decision boundary.

## Accept rules

- A1. Run on calibration first; report `unsafe` + `wrong-proc` + `recall` jointly.
- A2. Validate **once** on the new held-out; do not tune on it.
- A3. Both seeds reproduced; results per seed and pooled.
- A4. The layer stays refusal-only; a test asserts no procedure content is emitted on any escalated query.

## Reject rules

- R1. Do **not** open the cross-encoder reranker (CLOSED — register RX-01).
- R2. Do **not** move T01/T04 to 0.76/0.62 to chase zero-unsafe (product cost rejected — register RX-02).
- R3. Do **not** accept a change that lowers `unsafe`/`wrong-proc` but collapses `recall` below the
  agreed floor (set with the owner before the run).
- R4. A new embedder is a **separate** experiment: its own prereg, and a check against the
  rejected-experiment register, before any code is written.

## Evidence to be produced

- `tooling/refusal/` (proposed): the layer module + its harness, printing the joint metric on calibration
  and held-out for both seeds.
- Updated `KNOWN_ISSUES.md` §14 decision block recording option (d).
- Entries in `docs/prereg/rejected-experiments.md` for the reranker (CLOSED) and the threshold-bump
  (REJECTED).

---

## Amendment — 2026-10-07: R3 floor set by the owner (original R3 text above preserved verbatim)

**Zone.** Y (governance). **Status.** Owner decision recorded before any g15 run. The original R3
wording above is unchanged; this amendment supplies the floor it deferred.

- **R3 guard (Hatem, 2026-10-07):** maximum **10 percentage points** of answerable-recall loss versus
  the **gate-alone baseline**, **per tenant**, on **both calibration and held-out**.
- **The harness must report both:** the recall loss in percentage points **and** the number of
  answerable questions lost. At the current answerable N (calibration T01 12 / T04 27 / T05 14;
  held-out T01 6 / T04 11 / T05 11) one question is worth 3.7–16.7 pp, so the question count is the
  precise unit and the pp figure the summary.
- **This is a refusal-layer constraint, not a replacement for V2 D3.** V2 D3 ("In-scope recall >= 70%
  at 500 procedures on the gold set, per language") is unchanged and remains the program exit floor.
- **Why the guard is baseline-relative, not absolute:** the gate-alone baselines are T01 75.0/33.3,
  T04 37.0/54.5, T05 21.4/9.1 % (calibration/held-out) — five of six tenant/split cells already sit
  below 70%, so an absolute 70% floor would reject any layer before it ran. The prereg's own metric
  definition ("reported as the loss vs the gate-alone baseline") makes the loss the measured quantity.
- **Provenance of the baselines:** `tooling/corpus/gate-calibration.json` (data_mode: calibration,
  SHA-256 fbba405392c6db0f464e8f7b178eb79e586fb8659ece62cc535c620fb88e212a) and
  `tooling/corpus/gate-calibration-heldout.json` (data_mode: held-out, SHA-256
  1da142237d6315fb63219c4425b7c5c63f67737a6f656802f25b9094a4c4196f), produced by
  `GATE_SPLIT=calibration|held-out node tooling/corpus/calibrate-gate.mjs` at the `GATE_CONFIGS`
  thresholds (unchanged). Labels are agent-produced and UNVERIFIED; g15 results are
  agent-label-relative and establish no owner-backed D3 claim.

---

## Closure — 2026-10-07: **NEGATIVE RESULT — CLOSED — NOT ADOPTED**

Owner decision (Hatem). The original preregistration and its R3 amendment above are preserved verbatim;
nothing is rewritten. Final results: `tooling/refusal/g15-results.json` (run-time HEAD `f4745060`,
model `Xenova/all-MiniLM-L6-v2`, A4 no-content assertion OK; reproduced deterministically from the
committed harness at `2175879` — every metric byte-identical).

- **T01 (recorded separately so it is never read as a safety win):** R3 **PASS** — the selected
  configuration (t=0.66, m=0.10, both seeds) reduced wrong-proc (2→0 on calibration) with 8.33 pp /
  1-question recall loss on calibration and 0 pp / 0 questions on held-out. **Not adopted**: it
  provides no unsafe reduction (unsafe 1→1 on calibration, 0→0 on held-out) and adds refusal
  complexity for no safety gain.
- **T04: R3 NOT MET** — no qualifying configuration; minimum recall loss across the whole sweep
  29.63 pp (data_mode: calibration, ans N=27, OOS N=75).
- **T05: R3 NOT MET** — no qualifying configuration; minimum recall loss 14.29 pp (2 questions of 14):
  every served-answerable margin is < 0.10, so the margin signal has no headroom on this tenant.
- **Conclusion:** no fleet-useful operating point within the R3 guard. The experiment is closed
  negative; retrieval quality is the current limiting factor; any retrieval change requires its own
  preregistered experiment (RX-03 draft: `docs/prereg/rx03-retrieval-quality.md`). All conclusions are
  agent-label-relative; no owner-backed D3 claim is made. The T01 configuration is NOT wired into any
  shipped code path.
