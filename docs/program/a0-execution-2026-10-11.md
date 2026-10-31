# A0.1–A0.7 execution report

**Date:** 2026-10-11 (Africa/Cairo)
**Branch:** `prog/xss-real-client`
**Commit SHA:** `2b05106c64e9173e81213771ddb4e1c9aa6039ae`
**Data mode:** A0.3 used simulated data. A0.5 policy harness is deterministic test data. No live tenant/customer data was used.
**Tree state:** worktree was extensively dirty before this run; no pre-existing changes were reset or overwritten.

The repository's V2 brief names these as P0 tasks, not A0.1–A0.7. This report follows the first seven P0 `Do` items in order, as the closest explicit sequence. `00_CONSTITUTION.md` is missing; no content was inferred or created.

## A0.1 — install and build

**DID:** Tried install and build in order.
**PROVED:** None. `pnpm install && pnpm -r run build` failed before build because pnpm could not create `/home/<user>/.local/share/pnpm/store` (`ENOENT`). The three attempts and exact outcomes are in `docs/program/FAILURES/A0-1-install-build.md`.
**NOT DONE:** Build did not run. Three attempts reached the cap.
**RISK:** Existing `node_modules` is from a different platform; some direct harnesses fail to load native `sharp` on Linux.
**NEXT:** Re-run on a host with a writable pnpm store and supported TTY install confirmation.

## A0.2 — JS and SQL verification

**DID:** Ran the JS gate and DB gate in sequence.
**PROVED:** `bash tooling/db/verify-phase7.sh` completed offline SQL parsing: 7 SQL files passed lint.
**NOT DONE:** `pnpm run verify` could not start after three pnpm invocations; default store creation failed, `--store-dir` was rejected for `pnpm run`, and `--config.store-dir` still triggered the install store error. DB suites did not run because `docker` is not installed (`command not found`).
**RISK:** No current full JS or live PostgreSQL result for this worktree.
**NEXT:** Restore the supported pnpm environment and Docker, then rerun `pnpm run verify` and `pnpm run verify:db`.

## A0.3 — pinned inputs and ticket validator

**DID:** Hashed the batch, its corpus, the manifest, and all seven manifest snapshots before validation. Full values: `docs/program/a0-pinned-hashes.md`.
**PROVED:** `node tooling/eval/simulated-tenant/verify-tickets.mjs tooling/eval/simulated-tenant/chaos-500.json` printed `SIMULATED DATA VALIDATION OK`: 500 tickets, 75 chaos tickets, 0 email/phone pattern findings. The validator describes its scope as synthetic generation and pattern checks, not external-dataset anonymization certification. Snapshot hashes match their content-addressed filenames.
**NOT DONE:** No broader privacy certification was attempted.
**RISK:** The validator checks only its stated patterns and synthetic dataset.
**NEXT:** No action for this item.

## A0.4 — G11 provenance rerun

**DID:** Attempted the canonical 0.18 run under fresh label `a0-g11-20261011`.
**PROVED:** The run stopped before browser startup. `requireChrome()` reported no Chrome/Chromium at supported paths or PATH; targeted searches in `/usr/bin`, `/opt`, `/snap/bin`, and known browser caches found none. Failure record: `docs/program/FAILURES/A0-4-g11-rerun.md`.
**NOT DONE:** No new evaluation report or comparison was produced.
**RISK:** The carried baseline is not remeasured on this host.
**NEXT:** Run the same command where Chrome/Chromium is installed; do not reuse the label if a report has been created elsewhere.

## A0.5 — G1 model integrity and divergence

**DID:** Ran the server model policy harness and the sync install harness.
**PROVED:** `node tooling/verify-publish-model-policy.mjs` — 24 checks, 0 failures; `PUBLISH MODEL POLICY OK`.
**NOT DONE:** `node tooling/sync/verify-sync.mjs` could not load the Linux `sharp` runtime from the existing install. The deployed/local margin divergence was not reproduced; that requires the deployed path and is not claimed as proven. No gate behavior or threshold was changed.
**RISK:** The server policy checks do not prove the actual client refuses the mismatched bundle in this run, nor explain the historical divergence.
**NEXT:** Re-run `verify-sync.mjs` after a platform-correct install; reproduce divergence only with the model matched on the deployed path.

## A0.6 — G8 portable demo tooling

**DID:** Checked syntax and the rename-aside failure fallback.
**PROVED:** `python3 -m py_compile tooling/video/gen-titlecards.py tooling/video/assemble-video.py` and `node --check` for `capture-demo.mjs` and `find-chrome.mjs` completed; `node tooling/video/tests/rename-aside-fallback.mjs` passed its fallback scenario. Environment overrides for Chrome, ffmpeg and ffprobe are present in source.
**NOT DONE:** Full browser capture and video assembly were not run; no browser binary is available.
**RISK:** Static checks and one fallback harness do not establish a successful end-to-end capture on this Linux host.
**NEXT:** Run capture on a host with Chrome/Chromium, ffmpeg and ffprobe installed.

## A0.7 — G9 dependency gate

**DID:** Rechecked workspace membership and ran the audit gate using a captured pnpm audit report in `/tmp`.
**PROVED:** `pnpm --config.store-dir=/tmp/live-support-assistant-pnpm-store audit --prod --json` reported 0 advisories across 80 dependencies; `SOP_AUDIT_JSON=/tmp/live-support-assistant-audit.json node tooling/audit-gate.mjs` passed with baseline 0, new 0, escalated 0. `apps/mobile` remains excluded by `pnpm-workspace.yaml`. The existing G9 preregistration records its historical accepted result.
**NOT DONE:** This run could not re-establish G9's full verify accept condition because A0.2's JS gate did not complete. The `sharp` patch is reflected in the existing lockfile and the Linux native package is unavailable in current `node_modules`.
**RISK:** Current dependency audit is clean, but the full verification gate remains unproven here.
**NEXT:** Re-run the full JS gate after fixing the local pnpm installation.

## Owner decisions and scope

Production data region is EU. The provider's precise region identifier and the deployed project's configured region remain unverified. Standing authorization permits non-force pushes of `prog/**` only after a full-history secret scan; this run did not push. No thresholds or claims were edited to make a gate pass.
