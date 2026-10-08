# Phase 1 report — licensed corpus and a gold set you can defend

**Phase.** P1 (V2 §5).
**Date.** 2026-10-08.
**Branch.** `prog/p1-corpus`, merged into `prog/main` (fast-forward, local only — no push).
**Base SHA.** `6e337d9` (`prog/main` at cut).
**Commits.** 60 on the branch; the close is `399e6d6` (freeze) + this report's commit.
**Working tree at measurement.** Clean.
**data_mode.** Every gold row `simulated`. Measurement splits `calibration` / `held-out`.

---

## Gate

| Gate command | Result |
| --- | --- |
| `node tooling/corpus/verify-corpus.mjs --manifest tooling/corpus/manifest.json` | **exit 0**, 459 rows, 0 failures |
| `pnpm run verify` | **14 of 14 suites passed** |
| `pnpm run verify:db` (owner, host, 2026-10-07 and 2026-10-08) | **all four suites OK** — RBAC 99/99, phase5 27/27, RLS bypass 40/40, retention OK (16 **carried, not re-measured**); DB recreated from empty |
| `pnpm run verify:deployed` | 19/19 at `3bab890`; **re-run pending** — the client gate wiring changed since |

---

## Verdict per P1 exit item

| # | Requirement (V2 §5 P1) | Verdict | Evidence / reason |
| --- | --- | --- | --- |
| 1 | Exit gate `verify-corpus.mjs` exits 0 | **MET** | exit 0; asserts provenance, licences, PII, counts, split files, and `origin`+`label_source` on every row |
| 2 | Licence allowlist, NC/ND excluded | **MET** | `tooling/corpus/licence-allowlist.json` (allowed + `excluded_ids` + `excluded_by_policy`); OQ-003 |
| 3 | Provenance (URL, time, SHA-256, source id) | **MET** | content-addressed snapshots + `manifest.json` |
| 4 | Privacy: quarantine, never scrub; >5% → drop source | **MET** | quarantine gate; two candidate sources dropped on real findings |
| 5 | Attribution file per corpus | **MET** | `docs/CORPUS_PROVENANCE.md` |
| 6 | Stability: snapshots, live fetch never a build input | **MET** | `tooling/corpus/snapshots/<sha256>.json` |
| 7 | Fleet **≥ 4 tenants** | **NOT MET** | **3 tenants** (T01, T04, T05) — cut #1, one below the cut line; harvesting closed by owner instruction |
| 8 | ≥ 2 domains | **MET** | 3 — platform-ops, customer-support, policy |
| 9 | ≥ 2 non-English languages | **MET (corpus) / NOT MET (measurable arm)** | T01 carries en/es/fr/pt-BR; the 42 non-English gold rows are `agent-agreed`, unverified |
| 10 | Rungs 40 and 500 | **NOT MET** | 500 + MVR built per tenant; **no rung-40**. The 500-rung claim is restricted to the largest rung actually measured |
| 11 | Gold set 150–300 per tenant | **T01 MET (170) · T04 NOT MET (145) · T05 NOT MET (144)** | counts from `questions.json`; T04/T05 are ~5 rows short |
| 12 | `derived-paraphrase` leakage control ≤ 0.30 | **MET** | computed and reported, **not applied** as a filter (filtering rejects on-register rows) |
| 13 | Two independent labelling passes | **MET** | agreement → `agent-agreed`; disagreement excluded |
| 14 | `spotcheck.mjs` emits owner batches | **MET (built)** | batch 1 emitted 15 rows; multilingual batches are 6 rows |
| 15 | Owner spot-check ≥ 85% | **NOT DONE** | never run; **not owner-validated** (OQ-002). 5 rows are `owner` on `full-text-verbatim` evidence (3 answerable) |
| 16 | D3 in-scope recall ≥ 70% at 500, per language | **NOT MEASURABLE** | 3 answerable owner rows against a 150–300/tenant/rung requirement; per-language arm unverified |

**Honest summary: the corpus half of P1 is met; the fleet-size and gold-set-size requirements are not,
and the owner-verification requirement was never run.** That is the state the phase closes in.

---

## What changed

1. **Corpus built and closed.** 3 tenants, 544 documents → 3,659 procedures; harvesting closed.
2. **Gold set built and frozen.** 459 rows: T01 170 · T04 145 · T05 144; 140 answerable / 319
   `out_of_scope`; 315 calibration / 144 held-out.
3. **Multilingual arm added.** 42 rows (es/fr/pt-BR, 14 each) authored from frozen-rung documents.
4. **Provenance corrected and frozen at source.** Per-row `evidence_basis`; `label_source=owner`
   restored for the 5 rows decided on `full-text-verbatim` evidence.
5. **Two experiments run and closed negative/rejected** — g15 (refusal layer) and RX-03 (bi-encoder).

## Numbers

All `data_mode: "simulated"` for gold rows. Every figure carries its N.

| Measure | Value | Denominator / bound |
| --- | --- | --- |
| Tenants | 3 | target ≥ 4 |
| Documents → procedures | 544 → 3,659 | per-tenant: T01 2,318 · T04 577 · T05 764 |
| Gold rows | **459** | T01 170 · T04 145 · T05 144 |
| Answerable / `out_of_scope` | 140 / 319 | — |
| Calibration / held-out | 315 / 144 | fixed seed `20261007`, 70/30 |
| Provenance | owner 5 · agent-agreed 87 · agent-full-text 1 · construction 196 · agent 95 · agent-single 75 | — |
| Owner rows for recall | **3 answerable** (OD-02/04/05, T04 calibration) | 150–300 required → **NOT MEASURABLE** |
| Gate-alone answerable recall | T01 75.0% (N=12) · T04 37.0% (N=27) · T05 21.4% (N=14) | calibration, `gate-calibration.json` |
| Held-out gate-alone recall | T01 33.3% (N=6) · T04 54.5% (N=11) · T05 9.1% (N=11) | `gate-calibration-heldout.json` |
| 500-rung answerable R@1 (incumbent) | T04 **30.0%** (n=20) | MVR rung 70.0% — the rung must be named |

## Rejected experiments

| id | Experiment | Disposition |
| --- | --- | --- |
| g15 | P4 scope/refusal layer | **CLOSED — NEGATIVE — NOT ADOPTED.** No fleet-useful point inside the R3 guard; T01's config cut wrong-proc without cutting unsafe |
| RX-03 | Bi-encoder replacement (`multilingual-e5-small`) | **CLOSED — REJECTED on judgment.** A1 met, but R@1-only gain with R@3/R@5 regression and a worse OOS surface |
| RX-01 | Cross-encoder reranker | CLOSED (not pursued) |
| RX-02 | Move T01/T04 to calibration zero-unsafe points | REJECTED (product cost: refuses 83% / 74%) |

## Parked items

| id | What | Default in effect |
| --- | --- | --- |
| OQ-002 | Owner spot-check batch 1 (15 rows) | **NOT DONE**; 5 owner rows carry recall with the basis printed |
| OQ-009 | Retrieval baseline review | No claim published |
| OQ-010 | Multilingual spot-check (bilingual, 6-row batches) | Rows unverified, `derived-paraphrase`, never a headline |
| OQ-011 | Re-show the 7 first-batch AGREE rows on full text | Rows stay `agent-agreed` |
| OQ-006 | Role-address exclusion (would recover T05's policy tree) | Site-policy stays dropped |

## Not done, and why

- **Fleet is 3, not 4.** Two further candidates were registered and dropped on genuine privacy
  findings; harvesting is closed. This is a cut *beyond* the cut line, recorded as such.
- **T04/T05 are ~5 rows short of 150.** No further label building — the set is frozen.
- **Owner spot-check not run.** Owner work, parked. Until it passes, `agent-agreed` rows stay
  `unverified` and out of headlines.
- **Rung 40 not built.** MVR is the small rung; the 500-claim is restricted to the largest rung measured.
- **Per-language retrieval not measured.** The rows exist now; measuring them is a separate
  preregistered run (calibration split only, unverified/exploratory).

## Next phase unblocked

**Yes — with limits stated.** P5 (security and isolation proof) and P2 (Market Twin smoke rung) do not
depend on gold labels and may start now. Any *recall or D3* claim remains blocked on the owner
spot-check. The per-language retrieval measurement is deliberately last and stays exploratory.
