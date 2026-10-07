# Rejected / closed experiment register

Retrieval-quality experiments considered for zero-unsafe. **Any new embedder or reranker must be checked
against this register before code is written** (g15 R4). A closed/rejected item is not reopened without a
new owner ruling and its own prereg.

| id | experiment | disposition | rationale | date |
| --- | --- | --- | --- | --- |
| RX-01 | Cross-encoder reranker on top of MiniLM-L6-v2 retrieval | **CLOSED** | Adds a model and a latency/cost surface; the owner chose the P4 refusal-layer path (option d) instead. Not pursued. | 2026-10-07 |
| RX-02 | Move T01/T04 to calibration zero-unsafe points (0.76 / 0.62) | **REJECTED** (product cost) | Refuses 83% / 74% of answerable traffic; a product decision, not a technical fix. Owner deferred. T01/T04 stay at shipped thresholds (`fails-calibration`). | 2026-10-07 |
| RX-03 | New / stronger bi-encoder embedder | **PREREG DRAFTED — NOT RUN** (`docs/prereg/rx03-retrieval-quality.md`) | Likely the real fix for retrieval quality. Draft prereg prepared 2026-10-07; requires owner ratification of the frozen selection rules before any execution. | 2026-10-07 |
| G15 | P4 scope/refusal layer (pre-gate margin/top-1 escalation, refusal-only) | **CLOSED — NEGATIVE RESULT, NOT ADOPTED** | Evaluated under preregistered conditions with the R3 ≤10 pp guard. T01's one qualifying configuration reduced wrong-proc (2→0) without reducing unsafe and was not adopted; T04 and T05 had no qualifying configuration (min recall loss 29.63 / 14.29 pp). Retrieval quality is the limiting factor. | 2026-10-07 |
