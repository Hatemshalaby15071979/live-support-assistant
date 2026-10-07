# Rejected / closed experiment register

Retrieval-quality experiments considered for zero-unsafe. **Any new embedder or reranker must be checked
against this register before code is written** (g15 R4). A closed/rejected item is not reopened without a
new owner ruling and its own prereg.

| id | experiment | disposition | rationale | date |
| --- | --- | --- | --- | --- |
| RX-01 | Cross-encoder reranker on top of MiniLM-L6-v2 retrieval | **CLOSED** | Adds a model and a latency/cost surface; the owner chose the P4 refusal-layer path (option d) instead. Not pursued. | 2026-10-07 |
| RX-02 | Move T01/T04 to calibration zero-unsafe points (0.76 / 0.62) | **REJECTED** (product cost) | Refuses 83% / 74% of answerable traffic; a product decision, not a technical fix. Owner deferred. T01/T04 stay at shipped thresholds (`fails-calibration`). | 2026-10-07 |
| RX-03 | New / stronger bi-encoder embedder | **DEFERRED — own prereg required** | Likely the real fix for retrieval quality, but must enter via its own prereg and a register check (g15 R4) before any code. | 2026-10-07 |
