# Program status board

One row per phase. Updated at every phase end. Values: `done` | `in progress` | `parked` | `not met`.

| Phase | Scope | Status | Gate | Report |
| --- | --- | --- | --- | --- |
| P0 | Integrity and baseline | **done** | `pnpm run verify` 10/10; ticket validator OK; D7 red-then-green (client and server); `docs/BASELINE.md` complete. SQL suites `not re-run` (host sandbox). | `docs/program/phase-0-report.md` |
| P1 | Licensed corpus and gold set | **frozen — ready to close** | **3 tenants / 3 domains, harvesting CLOSED (cut #1 — one below the cut-line floor).** 544 documents → 3,659 procedures. **Gold set FROZEN 2026-10-08: 459 rows**, register C, document-level labels; `verify-corpus.mjs` exit 0. Limits stated below. | `docs/CORPUS_PROVENANCE.md` |
| P2 | Market Twin (smoke + standard) | not started | `run-market.mjs --seed 20261006 --rung smoke` exits 0 | — |
| P3 | Retrieval at 500 | not started | per-rung/per-language tables; D3/D4 reported honestly | — |
| P4 | Gate and safety hardening | not started | D1, D2, D5, D7 reported honestly | — |
| P5 | Security and isolation proof | not started | D6 and D11 met | — |
| P6 | Tenant lifecycle (scripted) | not started | D10 met; journey recorded | — |
| P7 | Operations, lite | not started | D9 and D12 met; drills recorded | — |
| P8 | Evidence pack and close | not started | `pnpm run evidence` green from a clean clone | — |

## Cut line (from V2 §11)

If time runs short, drop in this order and record each cut here:
P7 cost model → P6 metering → P3 per-language index (keep per-language thresholds) → P1 fleet from 6 to 4 tenants.
**Never cut:** P0, P2 smoke, P4, P5 isolation suite, P8.

## Cuts taken

| # | Cut | Line allows | Actual | Why | Consequence |
| --- | --- | --- | --- | --- | --- |
| 1 | **P1 fleet** | 4 tenants (cut line) · 4–6 (V2) | **3** — T01, T04, T05 | Two further candidates (`django-faq-en`, `cpython-faq-en`) were registered and dropped on genuine findings — one published security contact and one example address, each a single finding in a very small source. Harvesting is closed by owner instruction. | **Below the cut line's own floor, not merely within it.** Recorded as a cut *beyond* the line. Every figure from the fleet is a 3-tenant figure, and the per-language arm is T01 alone. |

**Fleet as accepted, 2026-10-07:** T01-platform-operations-style (2,318 procedures, en/es/fr/pt-BR),
T04-customer-support-style (577, en), T05-policy-style (764, en). **Harvesting is closed. No further
sources will be added.**

## Gold set freeze — 2026-10-08

Frozen as it stands. **No further label building.** `questions.json` = **459 rows**, regenerated from
source (`assemble-questions.mjs` exit 0) and verified (`verify-corpus.mjs` exit 0). Provenance:
owner 5 · agent-agreed 87 · agent-full-text 1 · construction 196 · agent 95 · agent-single 75.

**Stated limits (every figure inherits these):**

1. **Owner rows: 5** — OD-02/04/05/11/15, decided on `full-text-verbatim` (hash-verified) evidence.
   **3 are answerable** (all T04 calibration) → **recall/D3 NOT MEASURABLE** at the required
   150–300 questions/tenant/rung. No figure may present recall or D3 as a headline.
2. **Multilingual arm (T01 es/fr/pt-BR, 42 rows):** `agent-agreed`, `origin=derived-paraphrase` —
   **never a headline**; **unverified** until OQ-010 passes; **anecdote-grade, technical docs only**
   (held-out N: es 7, fr 7, pt-BR 5).
3. **7 first-batch AGREE rows** rest on 150-char fragments (OQ-011).
4. **Fleet = 3 tenants**, one below the cut-line floor.

Next after close: (a) one preregistered per-language retrieval measurement (calibration split only,
unverified/exploratory); (b) P2 Market Twin smoke rung and P5 isolation suite — neither needs gold
labels, both on the never-cut list.

## Open items carried into P1

| Item | Why it is open | Where |
| --- | --- | --- |
| ~~SQL suites not re-run~~ **CLOSED 2026-10-07** | Owner ran `verify:db` outside the sandbox: all four suites OK, counts reproduce exactly (99/27/40, retention OK) | `docs/BASELINE.md` §6 |
| ~~Deployed path not re-run~~ **CLOSED 2026-10-07** | Owner authorized `verify:deployed` against the dev project: **19/19, `DEPLOYED STRANGER PATH OK`**, commit `3bab890` | `docs/BASELINE.md` §7.2 |
| Deployed/local divergence not reproduced | P0 removed the mechanism, not the reproduction. Tracked as probe **MC-09** in P5 | `docs/program/P5_PROBES.md` |
| OQ-002 owner spot-check **NOT DONE / NOT OWNER-VALIDATED** (Hatem did not inspect the documents); `evidence_basis` re-tag **2026-10-08**: owner ×5 (full-text-verbatim; 3 answerable, T04 calibration), agent ×10 (fragment-only) | **Recall/D3 NOT MEASURABLE at the required 150–300/tenant/rung** (only 3 answerable owner rows); agent rows unverified; multilingual arm unverified `derived-paraphrase` (never a headline) | `docs/program/OWNER_QUEUE.md`, `tooling/corpus/spotcheck-batch-1.json`, `docs/program/DECISIONS.md` |

## Owner follow-ups after P0

Completed 2026-10-07, recorded in `docs/program/DECISIONS.md`: sharp provenance reconciled ·
dependency-gate negative controls · guard-bypass logging rule · server half of D7.

## Branch map

- `prog/main` — local integration branch. Never pushed without the owner.
- `prog/p0-integrity` — P0 work.
- `exp/<id>` — Zone Y experiments.

`main` is untouched by this program.
