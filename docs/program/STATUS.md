# Program status board

One row per phase. Updated at every phase end. Values: `done` | `in progress` | `parked` | `not met`.

> **Current measurement (2026-11-13):** `CHROME_PATH=/usr/bin/google-chrome pnpm run verify`
> → **21/21 suites, exit 0**; `bash tooling/db/verify-phase7.sh` → exit 0. Rows below are dated
> observations at the SHA they name; a row saying 10/10, 14/14 or 17/17 is the count at that
> time, not the current gate. The full-history secret scan is **not clean** (641 hard-category
> hits over 275 commits); see `SHIPMENT_READINESS.md`.

| Phase | Scope | Status | Gate | Report |
| --- | --- | --- | --- | --- |
| P0 | Integrity and baseline | **done** | `pnpm run verify` 10/10; ticket validator OK; D7 red-then-green (client and server); `docs/BASELINE.md` complete. SQL suites `not re-run` (host sandbox). | `docs/program/phase-0-report.md` |
| P1 | Licensed corpus and gold set | **done** (2026-10-08) | **3 tenants / 3 domains, harvesting CLOSED (cut #1 — one below the cut-line floor).** 544 documents → 3,659 procedures. **Gold set FROZEN 2026-10-08: 459 rows**, register C, document-level labels; `verify-corpus.mjs` exit 0; `pnpm run verify` 14/14; `verify:db` all four suites OK. Verdicts: corpus half MET; **fleet ≥4 NOT MET (3)**, **gold set 150–300 NOT MET for T04 (145)/T05 (144)**, **owner spot-check NOT DONE**, **D3 NOT MEASURABLE**. Limits stated in the report. | `docs/program/phase-1-report.md` |
| P2 | Market Twin (smoke + standard) | **done** | Smoke rung is wired into the gate — `tooling/run-verification.mjs:138-145` (`key: 'market-smoke'`, `--seed 20261006 --rung smoke`, verdict line `MARKET TWIN SMOKE OK`). Standard rung merged at `2f765a5` (`git show --stat 2f765a5`), deliberately **not** in the gate: nightly, not merge-gating. | `docs/program/DECISIONS.md` (no P2 entry — recorded in git history only) |
| P3 | Retrieval at 500 | **in progress** | Fresh offline full/holdout inference on 2026-11-05: 500+500 WaveCast tickets; fresh Cedar Grove synthetic tenant at 50+50. The low Cedar Grove scores remain adverse evidence; per-rung/per-language tables and D3/D4 are still required. | `docs/program/execution-2026-11-04-live-support.md`; `docs/program/evidence/live-support-local-eval-2026-11-05/local-inference-results.json` |
| P4 | Gate and safety hardening | not started | D1, D2, D5, D7 reported honestly | — |
| P5 | Security and isolation proof | **in progress** | Local phase-7 run on 2026-11-04: 1,475 fleet probes, including 7 accepted F-1 claim-override failures (`rows:3`); local `anon` coverage unavailable. The owner decision records hosted `anon` coverage met on 2026-10-08; plain-English F-1 re-confirmation remains pending. | `docs/SECURITY_FINDING_F1_claim_override.md`; `docs/program/DECISIONS.md`; `docs/program/execution-2026-11-04-live-support.md` |
| P6 | Tenant lifecycle (scripted) | not started | D10 met; journey recorded | — |
| P7 | Operations, lite | not started | D9 and D12 met; drills recorded | — |
| P8 | Evidence pack and close | **in progress** | `pnpm run evidence` verified all 12 currently registered claims on 2026-11-04; this verifies the claims still registered, not full P8 completion or end-to-end tenant readiness. | `docs/SAFETY_CASE.md`; `tooling/evidence/verify-claims.mjs`; `docs/program/execution-2026-11-04-live-support.md` |

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

## P0 re-baseline — 2026-10-12

Supersedes the A0 row's "JS gate not run to completion" and "full verify condition was not
re-established" for the JS half. Record: `docs/program/p0-evidence-2026-10-12.md`.

| Item | Result |
| --- | --- |
| HEAD | `e934eb61b032c8b286c7bb2e1aac400de9de73f2` (`prog/xss-real-client`), clean tree |
| Remote truth | **established** — SSH has no key; **HTTPS + credential-manager works**; fetched all heads. `origin/main` `c9de5a2` (local 6 behind) · `origin/prog/main` `90d0570` (**22 behind the candidate**) · `origin/prog/xss-real-client` `e934eb6` |
| Ancestry | merge-base `2f23950`; `prog/main` is an ancestor; **11 commits, 28 files, +2476/−508** |
| Secret scan | **re-run at the current candidate** (old record named `d1d6052`): 210 commits / 879,941 lines, **all hard categories 0**; delta `d1d6052..e934eb6` all categories 0; review hits dispositioned. New tool `tooling/security/scan-history-secrets.mjs` |
| Install / build | install clean (frozen lockfile, 7 projects); `pnpm -r run build` **fails** (turbo pipe-busy, host); per-package builds pass (4 libs + web, build-identity `e934eb6`) |
| Gate | `node tooling/run-verification.mjs` → **17/17 pass, exit 0** |
| Dependency gate | 0 production advisories; baseline 0 · new 0 · escalated 0 → passed |
| Ticket validator | SIMULATED DATA VALIDATION OK (500 tickets, chaos 0.15/0.15, 0 PII findings) |
| Pinned data | all 12 inputs match `a0-pinned-hashes.md`; `chaos-500.json` = `717c40dc…` unchanged |
| Evidence pack | red by design: 12 verified / 4 unverifiable (exit 1) |
| Not run | `verify:db` (Docker stopped), `verify:hosted`, `verify:deployed` (credentials / authorization) |
| Blocker | GitHub connector cannot resolve the repo → tracker #1 and workstreams #2–#8 unreachable; queue mirrored in `OWNER_QUEUE.md` |

## Task C/D — merged-tip verification — 2026-10-12

Supersedes nothing; adds a measured row for the merged commit `df1e569`.
Record: `docs/program/integration-evidence-2026-10-12.md`.

| Item | Result |
| --- | --- |
| Merge verified | `df1e5694dd7cdb98fb848068798cfe5bcb9900a1`, parents `2f23950` + `7383314`, tree clean, 31 branches / 12 remote refs preserved |
| Remote | fetch OK over HTTPS; `origin/prog/main` `90d0570`; `prog/main` ahead 27; **not pushed** |
| Gate | `node tooling/run-verification.mjs` → **17/17 pass, exit 0** at the merged SHA |
| Scanner controls | `node tooling/security/verify-history-secret-scanner.mjs` → **17/17 pass, exit 0** |
| History scan | 228/228 commits, 968,929 lines, **0 hard hits**, 10 approved exceptions, exit 0; `--strict` surfaces exactly those 10 |
| Root build | `pnpm -r run build` → **FAILED** (`os error 231`, host limitation) — reported as failed |
| Package builds | 4 libs + `@sop/web` + `@sop/desktop` → PASS; `@sop/web` lint → 0 errors, 1 pre-existing warning; typecheck → PASS |
| Dependency gate | 0 production advisories · baseline 0 · new 0 · escalated 0 → passed |
| Pinned data | all 12 digests match `a0-pinned-hashes.md`; `chaos-500.json` = `717c40dc…` unchanged |
| Ticket validator | SIMULATED DATA VALIDATION OK — 500 tickets, chaos 0.15/0.15, 0 PII findings, exit 0 |
| NOT RUN | `verify:db` (Docker verified stopped), `verify:hosted`, `verify:deployed`, Admin-API XSS harness |
| Evidence pack | `pnpm run evidence` still red by design (12 verified / 4 unverifiable) |
| Correction | the merge commit's "226/226 measured at 7383314" was wrong; 226/226 was at `e06555f`, `7383314` = 227. See AGENTS.md. |

## Local readiness execution — 2026-11-04

The exact commands, source hashes, and machine-readable result are in
[`execution-2026-11-04-live-support.md`](./execution-2026-11-04-live-support.md) and
[`evidence/live-support-execution-2026-11-04.json`](./evidence/live-support-execution-2026-11-04.json).

`pnpm run typecheck`, `pnpm run verify` (17/17), `pnpm run evidence` (12/12 registered claims),
`pnpm run audit` (0 production advisories), and `pnpm run build:node` passed. `pnpm run lint`
completed with one existing React Hook dependency warning. `pnpm run test` did not execute a
package test suite: the workspace has no `test` scripts in its package manifests; `verify` is the
available harness gate.

The local database drill used a newly created disposable PostgreSQL container and removed it
afterward. The phase-7 verifier exited 0 with five of six SQL suites reporting OK; the fleet
suite's seven F-1 claim-override probes remain an accepted red, each observing three rows from
the other tenant. This is not a tenant-isolation pass. Anonymous-role coverage is unproven on the
local stack.

The checked-in 500-ticket fixture validates (500 tickets; 75 chaos tickets; 10 mutation classes;
zero email/phone pattern findings). Two generations from the current generator were byte-identical
to each other but did not match the pinned fixture hash, so the generator/fixture version mismatch
remains open. A full query evaluation was not run: an offline Node embedder probe failed with
`TypeError: this.tokenizer is not a function`; the authenticated application path was not run
because `.env.local` and `SUPABASE_URL` are absent. No external service, deployed app, or real
tenant data was accessed. The 500-ticket support fixture remains one fictional tenant; no
multi-tenant app workflow was proven.

### Continuation — 2026-11-04

The Transformers.js offline cache issue is fixed for local model loading via `createEmbedder`'s
optional `modelPath`; `node tooling/eval/verify-offline-embedder.mjs` now passes with remote
downloads disabled. This proves only a single query embedding, not a fresh 500-ticket evaluation.
The database gate was rerun on a new disposable local container and retained the documented
seven F-1 negative-control failures. The owner decision explicitly defers structural option C
until its trigger, so no migration or test expectation was changed. Hosted `anon` coverage,
authenticated product flows, full-batch inference, and a two-tenant end-to-end app path remain
open. See the continuation in
[`execution-2026-11-04-live-support.md`](./execution-2026-11-04-live-support.md). Readiness
remains **NOT READY**.

### Continuation — offline two-tenant inference — 2026-11-05

The new Node evaluation runner used the pinned MiniLM model cache with remote loading disabled.
Fresh inference completed for WaveCast full/holdout (500 tickets each) and a deterministic,
separate Cedar Grove fictional support corpus (50 tickets each). Results show 354/500 and 370/500
correct for WaveCast; Cedar Grove scored 26/50 and 23/50, with 51 false escalations across its two
splits. No runtime errors occurred. The weak Cedar Grove results are retained without tuning and
do not satisfy P3; per-rung/language tables, D3/D4, and the remaining phase gates are still open.

This is a local model/decision-path evaluation only, not an authenticated two-tenant application
test. No phase is closed. F-1's migration/probe expectation and acceptance remain unchanged.
See the detailed report and hashes in
[`execution-2026-11-04-live-support.md`](./execution-2026-11-04-live-support.md) and
[`local-inference-results.json`](./evidence/live-support-local-eval-2026-11-05/local-inference-results.json).
