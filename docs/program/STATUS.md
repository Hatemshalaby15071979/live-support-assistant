# Program status board

One row per phase. Updated at every phase end. Values: `done` | `in progress` | `parked` | `not met`.

| Phase | Scope | Status | Gate | Report |
| --- | --- | --- | --- | --- |
| P0 | Integrity and baseline | **done** | `pnpm run verify` 10/10; ticket validator OK; D7 red-then-green (client and server); `docs/BASELINE.md` complete. SQL suites `not re-run` (host sandbox). | `docs/program/phase-0-report.md` |
| P1 | Licensed corpus and gold set | **done** (2026-10-08) | **3 tenants / 3 domains, harvesting CLOSED (cut #1 — one below the cut-line floor).** 544 documents → 3,659 procedures. **Gold set FROZEN 2026-10-08: 459 rows**, register C, document-level labels; `verify-corpus.mjs` exit 0; `pnpm run verify` 14/14; `verify:db` all four suites OK. Verdicts: corpus half MET; **fleet ≥4 NOT MET (3)**, **gold set 150–300 NOT MET for T04 (145)/T05 (144)**, **owner spot-check NOT DONE**, **D3 NOT MEASURABLE**. Limits stated in the report. | `docs/program/phase-1-report.md` |
| P2 | Market Twin (smoke + standard) | **done** | Smoke rung is wired into the gate — `tooling/run-verification.mjs:138-145` (`key: 'market-smoke'`, `--seed 20261006 --rung smoke`, verdict line `MARKET TWIN SMOKE OK`). Standard rung merged at `2f765a5` (`git show --stat 2f765a5`), deliberately **not** in the gate: nightly, not merge-gating. | `docs/program/DECISIONS.md` (no P2 entry — recorded in git history only) |
| P3 | Retrieval at 500 | not started | per-rung/per-language tables; D3/D4 reported honestly | — |
| P4 | Gate and safety hardening | not started | D1, D2, D5, D7 reported honestly | — |
| P5 | Security and isolation proof | **in progress** | Probe list written: `docs/program/P5_PROBES.md` (7 categories, each with a negative control). MC-01..MC-08 proven locally, MC-09 left an unproven hypothesis — `docs/program/DECISIONS.md:40-55`. XSS harness rebuilt and run 21/21 — `docs/program/DECISIONS.md:7-21`. F-1 reproduced and dispositioned — `docs/SECURITY_FINDING_F1_claim_override.md`. **The isolation suite has not been run as a suite.** | `docs/program/P5_PROBES.md` |
| P6 | Tenant lifecycle (scripted) | not started | D10 met; journey recorded | — |
| P7 | Operations, lite | not started | D9 and D12 met; drills recorded | — |
| P8 | Evidence pack and close | **in progress — gate red** | `pnpm run evidence` exists; 12/16 verified, 4 unverifiable, 0 mismatches; unverifiable claims fail (`package.json:34`; `docs/SAFETY_CASE.md:24,105-109`) | `docs/SAFETY_CASE.md`; `tooling/evidence/verify-claims.mjs` |

## Reconciliation — 2026-10-09

The board above was last written before the P2 work landed, so it read "not started" for work
that is merged. Reconciled against the tree on 2026-10-09:

| Row | Was | Now | Evidence |
| --- | --- | --- | --- |
| P2 | not started | done | `tooling/run-verification.mjs:138-145`; `git log --oneline -- tooling/market/` (`b073f57`, `6b41fc3`, `2f765a5`, `e9192e2`, `7ad243c`, `07aa5e3`) |
| P5 | not started | in progress | `docs/program/P5_PROBES.md`; `docs/program/DECISIONS.md:7-55` |
| P8 | not started | not started — and its gate command is missing | `grep -n '"evidence"' package.json` → no match |

Rows P0, P1, P3, P4, P6, P7 are unchanged: the recorded values still match the tree.

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
| ~~SQL suites not re-run~~ **CLOSED — all four re-measured** | Owner ran `verify:db` outside the sandbox three times (2026-10-07 ×2, 2026-10-08): **all four suites OK**, counts reproduce exactly — RBAC 99/99, phase5 27/27, RLS bypass 40/40, **retention 16/16 (7+4+5), re-measured** (the earlier "carried" caveat is withdrawn). DB dropped and recreated from empty with all migrations applied. Recorded at HEAD `399e6d6` | `docs/BASELINE.md` §6, §6.1 |
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

## A0 execution — 2026-10-11

Execution record for A0.1–A0.7 (mapped in order to the first seven P0 `Do` items in V2; the repository documents the sequence as P0 and contains no literal A0.1–A0.7 labels): `docs/program/a0-execution-2026-10-11.md`.

Summary: A0.1 install/build not proved (pnpm store outside writable workspace; repair cap reached); A0.2 JS gate not run to completion and SQL only passed offline lint (Docker unavailable); A0.3 ticket validator OK after recording hashes of every pinned batch/corpus input; A0.4 G11 rerun not done (no browser binary); A0.5 server model policy 24/24, client sync harness blocked by incompatible `sharp` binary, deployed/local divergence not reproduced; A0.6 syntax and fallback checks pass, full capture not run; A0.7 audit gate passes with 0 production advisories, while the full verify condition was not re-established. No targets or thresholds were changed.
