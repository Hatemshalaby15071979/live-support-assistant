# Task C/D evidence — merged-tip verification and ledger

**Date:** 2026-10-12
**Merge commit verified:** `df1e5694dd7cdb98fb848068798cfe5bcb9900a1` (parents `2f2395047e195b15d60080296f49edfc9e9e8381` and `7383314a90075b91d2bdeb51a7ea145715685e16`)
**Branch:** `prog/main`, working tree clean at the start of Task C.
**Everything below was measured in this session.** Nothing is carried forward from the earlier P0 report; where a number is restated it is because it was re-measured here.

---

## C1 — Git integrity

| Check | Result |
| --- | --- |
| `git rev-parse --show-toplevel` | `E:/live-support-assistant` |
| Branch | `prog/main`, `## prog/main...origin/prog/main [ahead 27]` |
| HEAD | `df1e5694dd7cdb98fb848068798cfe5bcb9900a1` — **matches the reported merge commit** |
| Parents | `2f2395047e195b15d60080296f49edfc9e9e8381` + `7383314a90075b91d2bdeb51a7ea145715685e16` — **matches the reported parents** |
| `prog/xss-real-client` | `7383314a90075b91d2bdeb51a7ea145715685e16` (unchanged) |
| `main` / `origin/main` | `0b40b06` / `c9de5a2` (untouched) |
| Merge base (prog/main, xss) | `7383314` (the branch tip) |
| `prog/main` ancestor of `xss-real-client`? | NO — expected after a non-fast-forward merge |
| Working tree / stash | clean / empty |
| Branches / remote refs | 31 local branches, 12 remote refs — none deleted or rewritten |
| Remote fetch (HTTPS + credential-manager) | exit 0; `origin/prog/main` still `90d0570`; `origin/main` still `c9de5a2` — remote unchanged |
| Divergence | `origin/prog/main...prog/main` = **0 / 27** (27 local commits, none remote-only) |
| `git diff --check 2f23950..HEAD` | Only the known trailing whitespace in `tooling/corpus/spotcheck-batch-1.json`. That file is **pinned data** (its digest is in `a0-pinned-hashes.md`); the bytes were preserved, not repaired. |
| History rewrite / lost owner work | none: `git stash list` empty, no reset/clean run, reflog intact, graph shows the merge commit with both parents |

**Correction recorded against the previous report.** The merge commit message claims "226/226 commits … measured at 7383314". That is wrong on both halves and is corrected here: the 226/226 figure was measured at `e06555f` (the previous tip), and `git rev-list --count 7383314` = **227**. The scan that is evidence for the merged commit is the one below, at `df1e569`. The tree-identity claim in that message was true and remains true.

## C2 — Scanner negative controls and history scan

**Controls:** `node tooling/security/verify-history-secret-scanner.mjs` → **17 of 17 passed, exit 0**
(individually: registry-content-identity-stable · approved-exception-is-explicit · modified-occurrence-fails ·
wrong-file-fails · wrong-commit-fails · credential-url-with-pass-and-token-fails · api-key-patterns-fail ·
jwt-shape-fails · private-key-block-fails · no-leak-in-output · added-and-removed-events-inspected ·
subprocess-failure-fails-closed · git-nonzero-exit-fails-closed · incomplete-diff-fails-closed ·
stale-exception-fails-closed · detector-negative-control · content-lines-starting-with-`++`-are-scanned).
Redaction control verified: no planted value appeared in stdout, stderr or the JSON report.

**History scan at the merged commit** (`node tooling/security/scan-history-secrets.mjs HEAD --json <path outside the repo>`):

| Field | Value |
| --- | --- |
| Rev scanned | `HEAD` = `df1e5694dd7cdb98fb848068798cfe5bcb9900a1` |
| Commits | **228 of 228** (rev-list SHA set fully covered) |
| Changed lines inspected | **968,929** |
| Hard hits | **0** — private-key-block 0, jwt-shape 0, aws-access-key 0, google-api-key 0, supabase-secret-key 0, credential-url 0 |
| Review categories | password-assignment 3, db-host-ref 6, email-address 422 (42 domains) — all in the previously dispositioned safe classes |
| Approved exceptions applied | **10**, each bound to commit + path + op + content hash |
| Exit code | 0 |
| Strict view (`--strict`) | exit 1, and the **only** hard hits are the 10 registered occurrences — proving the detectors are live and that the exemptions are not masking anything else |

**A finding the scanner forced, and how it was resolved.** The first scan of the merged commit was **RED**: the
scanner's own negative-control suite had, in its committed source, planted credential-shaped literals
(a private-key header and three URL fixtures). Those are synthetic and reviewed, but "my own test file" is
not an acceptable exemption class — a scanner that must excuse its own fixtures has a hole in exactly the
place it exists to protect. Resolution, in order: (1) the test source was rewritten so every planted value
is **constructed from parts** and no credential-shaped literal exists in the committed file (verified by
grep: zero matches); (2) the historical occurrences in `7383314` and `df1e569` were left in history
(no rewrite) and each registered as an exact entry — 8 entries, `EXC-FIXTURE-PLANT-001..008`, each bound to
commit + path + op + SHA-256 of the normalized diff-line. A reintroduced literal would now fail closed and
require its own reviewed entry.

**JSON output location:** outside the repository tree, e.g.
`C:\Users\Thomas\AppData\Local\Temp\history-scan-c2-final-df1e569-precommit.json`. The committed scan JSON
in `docs/program/` names `e06555f` and is **not** relabelled as evidence for the merged SHA.

## C3 — Verification gate

`node tooling/run-verification.mjs` at `df1e569` → **17 of 17 suites passed, exit 0**
(legacy parity · encrypted sync protocol · persistence adapters · key rotation and revocation ·
confidence gate and manual review · telemetry queue · conflicting-procedure lint · publish-path conflict
block · dependency gate negative controls · publish-path model policy · corpus licence and privacy gates ·
planted-PII recall · planted-PII held-out recall · agent-skill enforcement · Market Twin smoke ·
Market Twin golden digest · render-path XSS harness). The XSS verdict still carries its own limit:
"stand-in page, NOT the built client — the real client path is not yet proven".

## C4 — Builds and quality

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm -r run build` (root, turbo) | **1** | **FAILED — `All pipe instances are busy (os error 231)`.** Documented host limitation. Reported as failed; the fallbacks below do not make it green. |
| `pnpm --filter @sop/core --filter @sop/embedder --filter @sop/vector-store --filter @sop/sync run build` | 0 | PASS — all four packages, `tsc`, "Done" |
| `pnpm --filter @sop/web run build` | 0 | PASS — 118 modules, build-identity stamped `e934eb6`, `dist/` emitted |
| `pnpm --filter @sop/web run lint` | 0 | PASS — 0 errors, 1 pre-existing warning (`react-hooks/exhaustive-deps`, App.tsx:436) |
| `pnpm -r --filter './packages/*' --filter '@sop/web' run typecheck` | 0 | PASS (`tsc -b`) |
| `pnpm --filter @sop/desktop run build` | 0 | PASS — `Built application at: …\sop-desktop.exe`, release profile |

## C5 — Dependency audit

`pnpm audit --prod --json` (written outside the repo) → fed to the gate via `SOP_AUDIT_JSON`:
**production advisories 0 (critical 0, high 0, moderate 0, low 0) · baseline 0 · new 0 · escalated 0 · resolved 0 → "dependency gate passed", exit 0.** The documented `spawnSync`/EBUSY workaround was used because the gate shells out.

## C6 — Pinned inputs

Every digest in `docs/program/a0-pinned-hashes.md` recomputed and matched exactly:

| Input | SHA-256 | Expected |
| --- | --- | --- |
| `chaos-500.json` | `717c40dcc7d1f31b51ea32b0b1bfa4bf418699167a5c5c7e2736cbea90191d96` | 717c40dc… ✓ |
| `corpus.json` | `e9e058685d255b24219ed5aab2ede0eaf62542eda9844b9b7b26becec63546fe` | ✓ |
| `spotcheck-batch-1.json` | `0d2a8b0f4f3f3887eacb12082425b00412a402c69079a3294c96ef2f0fc61629` | ✓ |
| `manifest.json` | `ab6923382b4b2ff8832519b774edce534106a8eb4bf016933b7732b84833da40` | ✓ |
| `smoke-golden-digest.json` | `aa20306b68d8baf9acd98366920bd5226816556adeb16312ad3b47006ae480cd` | ✓ |
| 7 × `snapshots/*.json` | each hashes to its own content-addressed filename | 7/7 MATCH |

No pinned input was modified.

## C7 — Evaluation data

`node tooling/eval/simulated-tenant/verify-tickets.mjs tooling/eval/simulated-tenant/chaos-500.json` →
**SIMULATED DATA VALIDATION OK, exit 0**: `data_mode: "simulated"`, 500 tickets, `chaosRateConfigured 0.15`,
`chaosRateActual 0.15`, 75 chaos tickets across 10 chaos types, `piiPatternFindings: 0`, 7 explicitly-missing
fields (`data_mode=simulated`, SHA recorded in this session).

## C8 — Database and hosted

- `docker info` → exit 1; `docker ps` → exit 1. **Docker daemon is genuinely unavailable**, verified before
  claiming it. `pnpm run verify:db` recorded as **NOT RUN** — the offline SQL lint that is step 0/6 of that
  script is **not** the database suite and is not counted as one.
- `pnpm run verify:hosted` → **NOT RUN**: no hosted credentials and no owner authorization in this session.
- `tooling/security/verify-xss-client-path.mjs` was **not executed**. It contains Admin API operations that
  create users and publish procedures; running it needs an isolated disposable backend, not the shared project.
- `supabase config push` was not run.

## C9 — Guard and acceptance review (from the merged diff)

- **No guard weakened.** `packages/**` is untouched by the merge — no gate, margin (`minMargin: 0.18`), or
  scoring change. The merge instead **adds** an asserted suite (`market-digest`, with a negative control).
- **No threshold or target loosened.** `tooling/run-verification.mjs` adds and renames; it removes nothing.
  The XSS suite's name was made *more* accurate, not less.
- **No pinned input mutated** (C6 above).
- **No tenant isolation made weaker.** `verify:db` suite 4 still requires the documented F-1 red; the
  tripwire (`rls_surface_audit.sql`) is untouched.
- **No secrets added.** Full-history scan: 0 hard hits; the only exempted occurrences are the reviewed
  documentation placeholder and the scanner's own synthetic fixtures.
- **No historical result relabelled.** The correction in C1 exists precisely to prevent that.
- **`pnpm run evidence` remains red** (12 verified / 4 unverifiable) — the four unresolved claims were not
  and are not "closed" by this session.

## Task D — ledger changes in this session

- New: `docs/program/integration-evidence-2026-10-12.md` (this file).
- Updated: `AGENTS.md`, `docs/program/STATUS.md`, `docs/program/DECISIONS.md` — new dated entries only.
- Updated: `tooling/security/history-scan-exceptions.json` (8 reviewed fixture entries added).
- Updated: `tooling/security/verify-history-secret-scanner.mjs` (planted values now constructed, so the
  committed source contains no credential-shaped literal).
- Final post-commit history scan is recorded in the session report, with its JSON outside the tree.
