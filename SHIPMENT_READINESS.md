# LIVE Support Assistant GitHub shipment readiness

**Assessment date:** 2026-11-06 (re-verified; prior assessment 2026-11-05)
**Branch:** `prog/main`
**Base HEAD before this audit's commit:** `1fed25d` (see `git log` for the
shipment commit SHA; this file is committed together with the reviewed
README edits below)
**GitHub destination:** <https://github.com/Hatemshalaby15071979/live-support-assistant>

This records local repository, CI-equivalent, synthetic evaluation, and
dependency checks. No push, release, deployment, or external write was
performed. The repository's own AGENTS.md authorizes local commits and
scoped non-force pushes after a full-history secret scan, but this audit was
run under a stricter instruction prohibiting any push — so nothing was pushed.

## Initial state (2026-11-06)

- Checkout `cloned_repos/live-support-assistant`, branch `prog/main`,
  HEAD `1fed25d`, remote `origin` = destination above.
- Uncommitted prior shipment edits (reviewed, preserved): README badge/link
  corrections and honest-claims rewrite, untracked prior
  `SHIPMENT_READINESS.md`, and untracked
  `docs/program/evidence/live-support-execution-2026-11-04.sha256`.
- **Blocker preserved untouched:** the `.sha256` file is filesystem-corrupt —
  `stat` fails with "Invalid argument" and it cannot be read. It was left
  exactly as found, was **not** staged or committed, and its contents are not
  claimed anywhere in this report. The owner should delete/recreate it from
  the `.json` evidence file on a healthy filesystem if it is still needed.

## Local verification (2026-11-06, re-run in this session)

| Check | Command | Outcome |
| --- | --- | --- |
| Lint | `pnpm run lint` | Passed (turbo-cached, inputs unchanged) |
| Typecheck | `pnpm run typecheck` | Passed, 9 tasks (turbo-cached) |
| Build | `pnpm run build:node` | Passed, 5 tasks (turbo-cached; Vite web bundle) |
| Verification gate | `pnpm run verify` | **17/17 suites passed**, incl. parity, encrypted sync, persistence, rotation, confidence gate, telemetry, publish-conflict block, PII recall, Market Twin, XSS stand-in harness (explicitly labelled a stand-in, not the built client) |
| Evidence | `pnpm run evidence` | **12 claims verified, 0 mismatch, 0 unverifiable** |
| Dependency gate | `pnpm run audit` | Passed; **0 production advisories**, 0 new/escalated |

Prior (2026-11-05) results also recorded: full-history secret scan at
`1fed25d` (237 commits, 1,002,690 lines, 0 hard hits, 17/17 negative
controls) and a Docker database verification with the documented accepted
F-1 finding (seven claim-override probes red at that time; anonymous-role coverage
unproven locally; hosted RLS run still needed). F-1 was subsequently fixed under G5 on 2026-11-13 —
the fleet suite is now green. The hosted/deployed-path
evaluator was **not** run: it writes synthetic tenant records to an external
development Supabase project and must not be described as a local deployment.

## Secret-history scan (2026-11-06 rerun)

- Ran the repository's own scanner:
  `node tooling/security/scan-history-secrets.mjs` → **"VERDICT: no
  hard-category hit"**, exit 0. An independent `git log --all -p` pattern
  grep found only the scanner's own marker strings in its source code.
- Tracked-file audit: no `.env`, private keys, databases, or `node_modules`
  tracked; `.env.example` contains placeholder/localhost values only.
- Pattern scans cannot prove no credential ever existed; no values are
  printed here.

## CI workflow review

`.github/workflows/ci.yml` is fit for its stated purpose: least-privilege
`permissions: contents: read`, pinned Node/pnpm versions, frozen lockfile
install, four jobs (workspace, database, desktop, audit), no deploy or
release job, and no secret exposure on pull requests. Third-party actions
are tag-pinned, not SHA-pinned. Hosted execution was not observed (no push).

## Gate behaviour evaluation — 2026-11-11 (findings L-1, L-2, L-3)

These three findings were logged *unresolved* because no harness measured the gate. That is no
longer true. Pre-registration (committed before the first run):
`tooling/eval/GATE_EVAL_PREREGISTRATION.md`; harness: `tooling/eval/gate-eval.mjs`.

`node tooling/eval/gate-eval.mjs` → **exit 0, VERDICT: PASS**. It replays the candidate scores
already recorded in committed synthetic evidence through the shipped gate **and** the
`buildAgentView` manual-review boundary (the product's actual decision path).

| Metric | Reporting batch (holdout, seed 20260929) | Tuning batch (chaos-500, seed 20260928) |
| --- | --- | --- |
| N | 500 | 500 |
| Unsafe answer accepted (product path) | **0** | **0** |
| Gate-only accepts later escalated for manual review | 37 | 33 |
| Out-of-scope accepted | **0 / 133** | **0 / 124** |
| False escalations (known recall limit, not a safety failure) | 141 / 367 (38.42%) | 165 / 376 (43.88%) |
| Replay agreement with recorded decisions | 500 / 500 | 500 / 500 |

Pilot prerequisites (L-3): **6/6** configuration faults fail closed — unknown tenant,
per-tenant map without a tenant id, NaN threshold, `topK = 0`, non-finite candidate score, empty
candidate list. A **positive control** proves the gate is not merely always blocking, and two
regression guards prove `escalationRequired` SOPs (`wc-security`, `wc-appeal`) can never produce an
answer.

**What this does not prove:** it replays recorded retrieval scores rather than re-embedding, so it
does not detect retrieval drift; it is not a live-tenant or hosted-transport test. The 37 gate-only
accepts are a design fact, not a defect — the manual-review boundary is load-bearing and is now a
CI-enforced regression guard (C16). Evidence:
`docs/program/evidence/gate-eval-2026-11-11/gate-eval.json`.

## Secret scan — 2026-11-11 (finding N-X-9)

The standing push rule requires a clean full-history scan. It previously failed on the
repository's *own* committed evidence and corpora (353 hits at `5ecc6f5`, all synthetic), and the
scanner was not wired into CI. Both halves are fixed:

- `tooling/security/scan-scope.json` declares, per path and with a reason, which paths are
  synthetic by construction (`test-fixture`) or documentation/evidence that quotes placeholders
  (`declared`). Demoted hits are **counted and reported**, never dropped: the report carries
  `syntheticScope.occurrences`, `byCategory`, `byPath` and `hardWouldBe`.
- The object scan now inspects only **ref-reachable** objects. Unreachable blobs are never
  transmitted by a push, and scanning them produced 283 phantom hits.
- `ci.yml` gains a `secrets-scan` job (`fetch-depth: 0`) that fails the build on a hard hit.

`node tooling/security/scan-history-secrets.mjs` → **exit 0, "no hard-category hit"**, 394
occurrences demoted and reported. **Negative control:** a throwaway clone with one planted
synthetic AWS key committed → exit 1, `aws-access-key: 1`. The gate still fails closed.

**What this does not prove:** a real secret committed inside a declared path would be demoted.
The `declared` kind therefore keeps private-key blocks and provider tokens hard everywhere; only
`test-fixture` files (the detector's own control suites) demote every category.
## Remaining limitations (not waived)

- Hosted GitHub Actions, branch protection, repository visibility, and
  remote state were **not verified** (push prohibited in this audit).
- The unreadable `.sha256` evidence file (above) needs owner action on a
  healthy filesystem.
- The product remains a prototype: unsafe-answer/recall limits are recorded
  in the README; hosted telemetry/escalation transport is not wired into the
  standalone demo; no external security audit or certified isolation is
  claimed. Production prerequisites remain open.

**Status: locally shipment-ready** for the owner's later push decision, with
the hosted verifications and limitations above still open. Nothing was
pushed, published, released, or deployed.
