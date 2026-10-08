# Gold-set extension — multilingual T01 rows (es / fr / pt-BR) — PREREG

**Zone.** Y (governance). **Status.** PREREG 2026-10-07; **BUILT 2026-10-07** (42 rows, commit
`b28a1de`); **FROZEN 2026-10-08** with the limits recorded in the Result block below. Owner spot-check
pending (OQ-010, bilingual presentation).

## Goal

Make the T01 **es / fr / pt-BR** arm measurable. RX-03 closed REJECTED with its multilingual premise
untested: the gold set has no non-English rows and no language metadata, so per-language retrieval
(R@k per language, D3/D4-style) could not be computed. This extension adds per-language gold rows so
that a future preregistered retrieval measurement can score each language separately — for the
incumbent and for any future candidate — instead of being blocked by the gold set.

**What this is not (owner correction 2026-10-08).** The rows are authored from T01's **technical
documentation only** (the Kubernetes tasks tree) — not real support traffic. Every per-language figure
from this arm is **anecdote-grade, technical docs only**, and must be printed with that label. The arm
is good enough for a paired model comparison; it is not good enough for an absolute per-language
headline, and it never produces one.

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
- A row enters the gold set only when both passes agree. `label_source = agent-agreed`. **What two
  passes agreeing means, and what it does not (owner correction 2026-10-08):** pass B re-found a source
  that pass A had written the question from, inside a small pool (es 18 / fr 32 / pt-BR 39 documents).
  Agreement therefore measures **source re-findability** — not label quality, not realism, and not
  whether another document also answers the question. `origin = derived-paraphrase` means these rows
  **never** carry a headline (V2 section 5 P1). A passed owner spot-check promotes them only to
  **owner-verified derived-paraphrase, reported as their own slice** — still not a headline.
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
2. **Owner spot-check bar (bilingual — the owner may not read es/fr/pt-BR):** each row is presented with
   its question in-language, a machine English translation flagged **"aid, not evidence"**, the verbatim
   source passage, and a machine translation of that passage. The owner judges one thing in English:
   *does this passage answer this question?* A native-speaker naturalness check is a **separate optional
   item**. Batches are **6 rows per language**. **≥ 85% AGREE** required. Below the bar: that language's
   labels are **discarded** (rows survive only as unverified robustness evidence) and the language is
   recorded as failed in this file's result block. Passing promotes the rows to **owner-verified
   derived-paraphrase — reported as their own slice, never a headline**. Languages pass or fail
   independently.
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

---

## Result block — 2026-10-07 (built) / FROZEN 2026-10-08

**Command:** `node tooling/corpus/assemble-questions.mjs` (exit 0), then
`node tooling/corpus/verify-corpus.mjs --manifest tooling/corpus/manifest.json` (exit 0). Commit
`b28a1de`. data_mode: simulated. Source: `tooling/corpus/slice-b-multilingual.json`.

| Language | Authored | In gold set | Calibration | Held-out | Rung pool |
| --- | ---: | ---: | ---: | ---: | --- |
| es | 14 | 14 | 7 | 7 | 18 docs |
| fr | 14 | 14 | 7 | 7 | 32 docs |
| pt-BR | 14 | 14 | 9 | 5 | 39 docs |

- **Two-pass agreement: 42/42, 0 disagreements, 0 exclusions.** This measures **source re-findability
  only** — a blind reader re-found a source the question was written from, inside a small pool. It is
  **not** evidence of label quality, not realism, and does not establish that no other document answers
  the question.
- **Provenance:** every row `label_source = agent-agreed`, `origin = derived-paraphrase`,
  `data_mode = simulated`. **`derived-paraphrase` never carries a headline.** The owner spot-check
  (OQ-010) is **NOT DONE**; until it passes, these rows are **unverified**.
- **Language honesty:** T01 technical documentation only. Every per-language figure is
  **anecdote-grade, technical docs only** (held-out N: es 7, fr 7, pt-BR 5).
- **Status of each language: UNVERIFIED** (spot-check pending). A passed language becomes
  **owner-verified derived-paraphrase** — its own slice, never a headline. A failed language is
  discarded (unverified robustness evidence only).
- **Frozen 2026-10-08.** No further label building on this arm. Any per-language retrieval measurement
  over these rows is a separate preregistered run, calibration split only, labelled unverified and
  exploratory.
