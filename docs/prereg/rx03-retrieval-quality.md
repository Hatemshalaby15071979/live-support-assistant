# RX-03 — Retrieval quality (bi-encoder replacement) — DRAFT PREREG

**Zone.** Y (governance). **Status.** DRAFT — prepared 2026-10-07, **NOT RUN**. Requires the owner's
ratification of the frozen selection rules below before any execution. Register: **RX-03**
(`docs/prereg/rejected-experiments.md`), which g15's R4 requires every retrieval change to pass through
before any code is written.

## Purpose

Retrieval quality only. g15 (P4 scope/refusal layer) is **CLOSED — NEGATIVE RESULT, NOT ADOPTED** and
established that the margin signal has no headroom at current retrieval quality: the binding constraint
is the encoder, not the gate. RX-03 tests whether one candidate bi-encoder improves retrieval quality
on the **existing** rungs and **existing** gold set.

## Explicit separations

1. **Retrieval model change** — the only intervention. Exactly one candidate bi-encoder, declared and
   frozen here **before the run** (candidate shortlist criteria: small enough for local/edge inference,
   permissive licence, multilingual coverage for T01's en/es/fr/pt-BR arm; the specific model id is
   named in the freeze commit — no implementation is chosen yet, by design). No reranker (RX-01 stays
   CLOSED). No hybrid/lexical stage. No query expansion.
2. **Corpus / gold set** — **FROZEN inputs, not variables.** `questions.json` (417 rows, SHA-256
   `4b166e6f…`, seed `20261007`) and the existing 500-rungs are used as-is. No harvesting, no new rows,
   no relabelling, no split change.
3. **Calibration vs held-out** — all selection happens on the **calibration** split. The **held-out**
   split is read **exactly once**, after the selection is frozen and recorded in this file's result
   block. Held-out remains untouched until then.
4. **R@1 / R@3 / R@5** — primary metrics, on the headline standard: 500-rung, clean Slice A
   (title-echo rows excluded from headlines and reported separately) + answerable Slice B, **per
   tenant**, and **per language** for T01's en/es/fr/pt-BR arm (D3/D4 apply per language).
5. **Precision / wrong-document rate** — among served answerable rows, the share whose top-1 document
   is outside the row's acceptable set. Printed beside every recall figure (V2 rule 9: a recall gain
   that adds an unsafe answer is an automatic rejection).
6. **Scope/refusal behaviour** — **observed, not modified.** The `out_of_scope` top-1 distribution per
   tenant is reported so a later gate recalibration has inputs. **No refusal threshold change is part
   of RX-03.**
7. **Tenant separation** — every metric per tenant; no fleet pooling (`out_of_scope` is tenant-scoped).
8. **Title-echo exclusion** — `title_echo: true` rows (17 of 75 Slice A rows at the last assembly) are
   excluded from headlines and reported separately.
9. **500-rung headline standard** — unchanged. MVR stays a scale-impact diagnostic only.
10. **Rollback criterion** — the incumbent `Xenova/all-MiniLM-L6-v2` remains the shipped configuration;
    its recorded baselines are the comparison anchor. If the candidate fails the accept rule, the only
    action is discarding the candidate's embeddings — no shipped code path changes.
11. **Comparison baseline** — `Xenova/all-MiniLM-L6-v2` as recorded in
    `tooling/corpus/baseline-results.json` (T04 500-rung answerable R@1 0.30, n=20), the g15
    gate-alone baselines (`tooling/refusal/g15-results.json`), and the g14 operating points in
    `gate-calibration*.json`.

## Accept rule (frozen before the run)

- A1. **Calibration only:** the candidate must improve clean-Slice-A + answerable-Slice-B **R@1** on at
  least two of the three tenants, with no tenant's R@1 dropping more than 2 pp, and answerable
  precision (wrong-document rate) not worsening on any tenant.
- A2. Only if A1 holds: **held-out once**, same metrics, same direction.
- A3. Determinism: the encoder is deterministic per text; each metric is produced by a single run and
  the run is recorded with its commit SHA. The gold split is not re-drawn.
- A4. **Rollback:** any A1/A2 failure → discard the candidate embeddings and close RX-03 in the
  register. The incumbent stays shipped.

## What RX-03 explicitly does NOT include

- **g15 is CLOSED** (negative, not adopted) and **cannot be silently combined with RX-03**; no
  scope/refusal layer runs in this experiment.
- **No refusal threshold change** and no gate threshold change: `GATE_CONFIGS` stays as shipped for the
  duration of RX-03. A threshold recalibration after an *accepted* embedder change is a **separate
  preregistered experiment** (the cosine distribution shifts with the model, so the current thresholds
  are not transferable — reported, not acted on).
- **No new tenant** and no harvesting; the fleet stays T01/T04/T05.
- **Held-out remains untouched** until the preregistered selection is frozen and recorded here.
- **Any new embedder or reranker beyond the one declared candidate is a separate registered change**,
  not a tuning detail (register check per g15 R4).
- **No owner-backed D3 claim** — all comparisons are agent-label-relative (0 `label_source=owner`
  rows; provenance vocabulary and authority semantics per V2 rule 7).

## Evidence to be produced

- A candidate-freeze commit naming the model id and its licence.
- A retrieval harness under `tooling/retrieval/` printing per-tenant (and per-language for T01)
  R@1/R@3/R@5, wrong-document rate, and the OOS top-1 distribution, side by side for the incumbent and
  the candidate, on calibration and (only after A1) held-out.
- A result record appended to this file (calibration selection block, then the held-out validation
  block) with command, N, commit SHA, and data_mode.
- Register update in `docs/prereg/rejected-experiments.md` (ACCEPTED / REJECTED) either way.
