# Phase 0 report — integrity and baseline

**Phase.** P0 (V2 §5).
**Date.** 2026-10-07.
**Branch.** `prog/p0-integrity`, cut from `origin/main`.
**Base SHA.** `c9de5a22fb480090dbbbbebcf4b2869a1061d4d3`
**Commits.** `f57a9f9` (D7) · `5a252df` (G8, G11) · `82cd4d8` (G9, D11) · docs commit.
**Working tree at measurement.** Dirty (32 paths) — P0's own changes. Recorded in the run report
itself as a caveat.

---

## Gate

| Gate command | Result |
| --- | --- |
| `pnpm run verify` | **8 of 8 suites passed** |
| `node tooling/sync/verify-sync.mjs` | **37 checks, 0 failures** (was 31) |
| `node tooling/eval/simulated-tenant/verify-tickets.mjs …/chaos-500.json` | **`SIMULATED DATA VALIDATION OK`** |
| `pnpm run audit` | **0 advisories**, empty baseline, gate passes |
| D7 test, before the fix | **FAILED — 4 failures** |
| D7 test, after the fix | **PASSED — 37 checks, 0 failures** |
| `pnpm run verify:db` | **NOT RE-RUN** — host sandbox blocks the Docker binary |

## What changed

1. **D7 / G1 — a bundle built for another model is refused.** `installBundle` takes a required
   `expectedModel` and rejects with `model_mismatch`; `apps/web` passes the loaded model and records
   the manifest's model in telemetry instead of the build constant. `ModelIdentity` moved from
   `server.ts` to `manifest.ts`, beside the field it describes.
2. **G11 — provenance in every run report.** New `tooling/eval/provenance.mjs`; three report
   writers record commit, branch and dirty state.
3. **G8 — portable tooling.** New `tooling/browser/find-chrome.mjs` replaces five divergent,
   four-Windows-only resolvers. `gen-titlecards.py` resolves fonts cross-platform.
4. **G9 — `@sop/mobile` excluded from the workspace.** One line; `Packages: -867`.
5. **D11 — the advisory set reaches zero.** Baseline emptied; `sharp` patched to 0.35.5.
6. **`audit-gate.mjs`** accepts its input via `SOP_AUDIT_JSON` when spawning is unavailable.

## Numbers

All `data_mode: "simulated"`. Batch SHA-256 `717c40dcc7d1f31b51ea32b0b1bfa4bf418699167a5c5c7e2736cbea90191d96`.

| Measure | Value | Denominator and bound |
| --- | --- | --- |
| Canonical 0.18 batch | 335/500 (67.0%), 165 false escalations, **0 unsafe** | **47 distinct messages** across 7 procedures; rule-of-three upper bound ≈ 6.4% at the distinct-message level |
| Reproduction of the recorded run | **identical decisions on all 500 tickets**; only latency differs (18.21 vs 19.71 ms mean) | — |
| Evidence base | 47 distinct messages (en 17, es 13, pt-BR 8, fr 10, +1 with no language column) | independently re-derived from the pinned batch |
| Production advisories | 0 | strict gate, empty baseline |

**Label provenance.** No new labels were created in P0. The 0.18 batch's expectations are the
existing `data_mode: "simulated"` generator expectations; the owner-labelled sets were not touched.

## Rejected experiments

None. P0 ran no Zone Y experiment other than G9, which was **accepted** against its prereg.

## Parked items

| id | What | Default in effect |
| --- | --- | --- |
| OQ-001 | Push `prog/main` and phase branches to `origin` | Stay local |
| OQ-005 | Accepting the node-forge advisory past its review date | Now moot — the advisory left with `@sop/mobile`. Entry kept for the record. |

## Not done, and why

- **SQL suites not re-run.** Docker runs and migrations begin applying, but the host blocks the
  script from invoking the Docker binary (`/usr/bin/env: bad interpreter: Permission denied`; the
  Security Center holds a read rule on it). Recorded as `not re-run`, not omitted. The four SQL
  counts remain carried from 2026-09-27.
- **Deployed path not re-run.** Needs the hosted project and public deployment — Zone R.
- **The deployed/local divergence (0.180757 vs 0.167715) was not reproduced.** It needs the
  deployed path. P0 removed its most plausible *mechanism* — the client now refuses a bundle built
  for a different model, and the publish function's `body.model` override is the documented way to
  produce one — but that is a hypothesis closed by construction, **not a reproduction**. Recorded
  as unreproduced.

## Next phase unblocked

**Yes.** P1 may begin. Its inputs are the licensed-corpus gates and the gold set; nothing in P1
depends on the SQL suites or the deployed path.
