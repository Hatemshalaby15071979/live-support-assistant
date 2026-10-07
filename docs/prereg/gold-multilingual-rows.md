# Gold-set extension — multilingual T01 rows (es / fr / pt-BR) — PREREG

**Zone.** Y (governance). **Status.** PREREG — written before any row is authored, per the same
discipline as g14. **NOT BUILT**: `questions.json` is unchanged by this document; the build step is a
separate, later change on top of a ratified prereg.

## Goal

Make the T01 **es / fr / pt-BR** arm measurable. RX-03 closed REJECTED with its multilingual premise
untested: the gold set has no non-English rows and no language metadata, so per-language retrieval
(R@k per language, D3/D4-style) could not be computed. This extension adds per-language gold rows so
that a future preregistered retrieval measurement can score each language separately — for the
incumbent and for any future candidate — instead of being blocked by the gold set.

## Scope

- **New answerable rows per language**, authored from **existing T01 localized documents only**
  (`content/es/…`, `content/fr/…`, `content/pt-br/…` of the already-harvested Kubernetes tasks tree).
- **No new harvest.** The harvested document set is closed (owner ruling, recorded in
  `docs/program/STATUS.md`); the extension authors questions, it does not fetch documents.
- **No split change.** Existing rows' splits are untouched; new rows enter through the same
  deterministic `splitFor` (seed `20261007`, `CALIBRATION_FRACTION` 0.7, plus the existing
  `PINNED_CALIBRATION` mechanism if ever needed). New ids are new inputs to the same hash.
- **Rung constraint (binding):** an acceptable document must already be represented in the **frozen**
  500-rung `rungs/T01-platform-operations-style-500.json`. Measured rung representation (command:
  `node -e` over `rungs/T01-platform-operations-style-500.json`, 2026-10-07): **es 37 procedures /
  ≤18 distinct source paths, fr 59 / ≤32, pt-BR 52 / ≤39**. Rows naming documents outside this rung
  would be unscoreable without a rung rebuild — prohibited here. Authors pick from the rung's
  document list only.
- **Slice:** `B` (user-voiced, grounded in a named document — the `slice-b-expansion` pattern),
  `label = answerable`, document-level acceptable set as everywhere else.
- **Every row carries:** `language` (`es` | `fr` | `pt-BR`), `label_source`, `origin`, `data_mode` —
  no exceptions.

## Label protocol

- **Two independent agent passes**, run without shared context: pass A reads the localized document
  and drafts the question + acceptable set; pass B reads the document fresh and either confirms or
  rejects the pair. **Disagreements are excluded** — dropped, not adjudicated, not recorded as rows.
- A row enters the gold set only when both passes agree. `label_source = agent-agreed` (two passes
  agreeing is exactly the existing semantic; per V2 rule 7 it supports recall headlines **only after**
  the owner spot-check below has actually occurred and is recorded — until then the rows are
  `unverified`).
- `origin = derived-paraphrase` (existing verifier-allowlisted value; the rows are authored
  paraphrase-style from a document, matching the 20 authored Slice A rows' origin).
- `data_mode = simulated` (same as the rest of the gold set — these are authored questions, not real
  customer traffic).
- Authoring language = the document's language. An es row is written in Spanish against a
  `content/es/` document; likewise fr and pt-BR. No translation of English gold rows.

## N per language

| Language | Target authored (raw) | Floor after disagreement exclusion (accept threshold) | Rung pool available |
| --- | ---: | ---: | --- |
| es | 14 | **10** | 37 procedures / ≤18 docs in rung |
| fr | 14 | **10** | 59 procedures / ≤32 docs in rung |
| pt-BR | 14 | **10** | 52 procedures / ≤39 docs in rung |

- The floor is **10 per language**: large enough for a paired per-language model comparison (the
  RX-03-shaped use case), honestly small in absolute terms — N=10 is anecdote-grade for absolute
  per-language headline claims and will be labelled as such wherever reported.
- Raw target exceeds the floor because disagreements are dropped, not fixed.

## Accept rule

Per language, independently:

1. **N floor:** ≥ 10 two-pass-agree rows land in `questions.json`, every acceptable document path
   verified against the corpus by `assemble-questions.mjs` (exit 4 on a miss, as it already does),
   every row carrying `language`, `label_source`, `origin`, `data_mode`.
2. **Owner spot-check bar:** the owner reviews **all** of a language's rows (N < 20, so the batch is
   the language) — **≥ 85% AGREE**. Below the bar: that language's batch labels are **discarded for
   headline use** (V2 P1 rule; rows survive only as unverified robustness evidence) and the language
   is recorded as failed in this file's result block. Languages pass or fail independently.
3. Leakage (3-gram overlap) is **computed and reported, not applied** — the same rule as Slice A.

A language that passes both steps makes its arm measurable; a language that fails either step is
recorded as failed and excluded from per-language claims until a re-run under a new prereg.

## Hard stops

- **No held-out read.** New rows land in calibration and held-out by the deterministic hash; held-out
  rows are never measured, summarized, or peeked at during any calibration-side work. The first
  measurement that may read them is a preregistered held-out validation.
- **No threshold / gate change.** `GATE_CONFIGS` stays as shipped; the extension changes the gold set,
  not the gate.
- **No embeddings.** The extension authors and assembles rows; it generates no embeddings. Any
  retrieval measurement over the new rows is a later, separately preregistered run.
- **g15 stays CLOSED** (negative, not adopted). **RX-03 stays CLOSED** (rejected on judgment). This
  extension makes the multilingual arm measurable for *future* experiments; it does not reopen either.
- No new harvest, no fourth tenant, no held-out split manipulation, no English-row relabelling.

## Evidence to be produced (later steps, each committed separately)

1. The authored source slice (e.g. `tooling/corpus/slice-b-multilingual.json`) with per-row
   two-pass records.
2. `assemble-questions.mjs` wired to include it; regenerated `questions.json` with all paths verified
   and per-language/per-split counts printed.
3. The owner spot-check batch per language with verdicts recorded.
4. A result block appended to this file (per language: N, pass/fail, spot-check tally).
