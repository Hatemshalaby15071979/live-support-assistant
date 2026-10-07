# RX-03 — Retrieval quality (bi-encoder replacement) — DRAFT PREREG

**Zone.** Y (governance). **Status.** Scope ratified as drafted by the owner (2026-10-07); **candidate
FROZEN 2026-10-07** (see `Candidate freeze` below); **calibration run 2026-10-07: A1 MET — CLOSED —
REJECTED on judgment, no held-out validation** (see `Result` at the end of this file).

## Purpose

Retrieval quality only. g15 (P4 scope/refusal layer) is **CLOSED — NEGATIVE RESULT, NOT ADOPTED** and
established that the margin signal has no headroom at current retrieval quality: the binding constraint
is the encoder, not the gate. RX-03 tests whether one candidate bi-encoder improves retrieval quality
on the **existing** rungs and **existing** gold set.

## Candidate freeze — 2026-10-07 (owner decision)

The candidate is **frozen**. No embeddings have been generated; no retrieval code changed; the
incumbent remains the shipped model.

| Field | Value | Source |
| --- | --- | --- |
| Candidate ID (load pin) | `Xenova/multilingual-e5-small` | HF registry (VERIFIED, fetched) |
| Candidate revision | `761b726dd34fb83930e26aab4e9ac3899aa1fa78` | HF registry (VERIFIED, fetched) |
| Upstream ID | `intfloat/multilingual-e5-small` | VERIFIED |
| Upstream revision | `614241f622f53c4eeff9890bdc4f31cfecc418b3` | VERIFIED (HF revision endpoint, fetched 2026-10-07) |
| Licence | **MIT** | HF listing; externally verified by the owner (in-session registry fetches for the upstream repo returned empty across 6 attempts — recorded, not hidden) |
| Dimensions | 384 | `config.json` `hidden_size` (VERIFIED, fetched) |
| Pooling | mean | model card usage (VERIFIED) |
| Normalize | true | model card usage (VERIFIED) |
| queryPrefix | `query: ` | model card FAQ (VERIFIED — omitting them "will see a performance degradation") |
| passagePrefix | `passage: ` | model card FAQ (VERIFIED) |
| Quantization | `q8` (`onnx/model_quantized.onnx` present) | HF registry siblings (VERIFIED) |
| Artifact checksum | **none recorded by the project** — immutability is carried by the two pinned revisions; a checksum can be recorded at first download if desired | repo grep: no checksum mechanism in `packages/embedder/src/` or `packages/core/src/` |

**Language qualification (exact):** the upstream model states coverage of the XLM-R multilingual
language set, and XLM-R explicitly includes: **en, fr, es, pt**. For the T01 pt-BR arm:
*"Portuguese coverage is supported; the model registry does not identify pt-BR as a separate locale
tag. RX-03 therefore tests Brazilian-Portuguese retrieval empirically rather than treating pt-BR
performance as proven."* (Language-set membership per the owner's external verification of the XLM-R
registry; the in-session fetch of that list failed — the chain is recorded rather than papered over.
`en` is additionally VERIFIED by the card's Mr.TyDi table, MRR@10 66.3.)

**Why C2 over C1** (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`, Apache-2.0, verified in-session):
the owner selected C2 for its retrieval-trained multilingual objective (contrastive pre-training +
MS MARCO/Mr.TyDi/MIRACL fine-tuning) and the XLM-R language set, versus C1's paraphrase/STS objective.
The existing `EmbeddingModelSpec` interface already carries per-model query/passage prefixes, so C2's
prefix requirement is declared, not discovered. Recorded honestly: C1's licence was verified in-session
while C2's MIT rests on the owner's external verification; C1 remains the fallback only if a material
incompatibility emerges.

**Not changed by this freeze:** the incumbent `Xenova/all-MiniLM-L6-v2` stays the shipped model
(`EMBEDDING_MODEL`); no embeddings generated; no thresholds touched; held-out untouched; g15 stays
CLOSED.

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

---

## Result — 2026-10-07: calibration run; **CLOSED — REJECTED on judgment (no held-out validation)**

Command: `RX03_COMMIT=$(git rev-parse HEAD) node tooling/retrieval/run-rx03-calibration.mjs` at HEAD
`63a1dce1ba6f78c5d6a03e83961eeb5f2c03b6ce`; harness `tooling/retrieval/run-rx03-calibration.mjs`;
results `tooling/retrieval/rx03-calibration.json`; data_mode: calibration; **held-out never read**
(0 held-out rows in the results; the only "held-out" string is the A1 verdict text).

**A1 MET on calibration** (headline = clean Slice A + answerable Slice B):

| Tenant | N | Incumbent R@1/R@3/R@5 | Candidate R@1/R@3/R@5 | R@1 Δ | wrongDoc@1 |
| --- | --- | --- | --- | --- | --- |
| T01 | 12 | 83.3% / 100.0% / 100.0% | 83.3% / 100.0% / 100.0% | 0 pp | 16.7% (both) |
| T04 | 27 | 44.4% / 77.8% / 81.5% | 48.1% / 63.0% / 74.1% | +3.7 pp | 55.6→51.8% |
| T05 | 14 | 50.0% / 71.4% / 85.7% | 57.1% / 64.3% / 71.4% | +7.1 pp | 50.0→42.9% |

OOS top-1 distributions, **observed only** (N 75/75/81): max top-1 T01 0.756→0.886, T04 0.619→0.896,
T05 0.686→0.887.

**Disposition: REJECTED on judgment, despite A1 being met.** The owner's ruling:
- **R@1-only gain**: T01 flat, T04 +3.7 pp, T05 +7.1 pp;
- **depth regression**: R@3/R@5 down on T04 (77.8→63.0, −14.8 pp) and T05 (71.4→64.3, −7.1 pp /
  85.7→71.4, −14.3 pp);
- **refusal cost**: OOS top-1 max rose on every tenant — a future threshold recalibration would start
  from a worse refusal surface;
- **multilingual value unmeasurable**: the T01 per-language arm is NOT MEASURABLE — 0 `language`
  fields in `questions.json`, and all 20 answerable T01 rows accept only `content/en/` documents.

Held-out was never read (A2 not reached). **Discarded:** the candidate's in-memory embeddings were
discarded with the process, and no candidate embedding or weight artifact persists on disk (verified
by cache and temp searches — the q8 download left no locatable cache entry; the cache mechanism is
recorded as UNKNOWN, not guessed). `EMBEDDING_MODEL` is unchanged (`Xenova/all-MiniLM-L6-v2` stays
shipped); the frozen spec entry remains in the model registry as a record of the rejected candidate,
marked not-for-shipped-use. All comparisons are agent-label-relative (0 `label_source=owner` rows); no
owner-backed D3 claim. Any future retrieval experiment (new gold rows for the multilingual arm, or a
different candidate) requires a new prereg and a register check.
