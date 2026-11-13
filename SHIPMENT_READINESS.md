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

## Local verification (2026-11-13, this session)

| Check | Command | Outcome |
| --- | --- | --- |
| Verification gate | `CHROME_PATH=/usr/bin/google-chrome pnpm run verify` | **21/21 suites passed, exit 0** — the 17 suites below plus four suites added on 2026-11-13: desktop CSP (HI-03), no real project refs (HI-05), vendored schemars checksum (ME-13), agent-text quarantine (ME-15). Output: `remediation/evidence/HI-12/verify-2026-11-13-final.txt` in the audit workspace. |
| Database gate | `bash tooling/db/verify-phase7.sh` | Exit 0; 7 suites OK including the HI-04 device-ownership regression. The fleet suite reports the documented F-1 accepted red (7 claim-override probes) on this base. |
| Frozen install | `pnpm install --frozen-lockfile` | Exit 0; lockfile unchanged. |

The suites cover parity, encrypted sync, persistence, rotation, confidence gate,
telemetry, publish-conflict block, PII recall, Market Twin, the XSS stand-in
harness (explicitly a stand-in, not the built client), and the three security
suites above. The real-client XSS path is still **not** proven: it needs hosted
credentials and writes to a shared project, so it is not in the gate (HI-02).

Prior (2026-11-05/06) results, kept as dated observations and **superseded where
they disagree with the 2026-11-13 run**: 17/17 JS suites, `pnpm run evidence`
12 claims verified, `pnpm run audit` 0 production advisories, and a Docker
database run with the accepted F-1 red. The hosted/deployed-path evaluator was
**not** run: it writes synthetic tenant records to an external development
Supabase project and must not be described as a local deployment.

## Secret-history scan (2026-11-13 rerun)

- `node tooling/security/scan-history-secrets.mjs` scans `--all` (275 commits,
  2,020,950 changed lines) and reports **641 hard-category hits**, exit 1:
  325 email-address, 11 credential-url, 9 db-host-ref, 7 password-assignment,
  3 private-key-block, 3 high-entropy-assignment. The hits are historical
  fixture/example values, but the scanner fails closed and the triage registry
  is empty, so this is **not** a clean scan and must not be described as one.
  The earlier "0 hard hits" claim came from a HEAD-only scan of a different
  revision and is withdrawn. This is why the scanner is not yet a merge gate
  (HI-02); triaging 641 occurrences is human work.
- Tracked-file audit: no `.env`, private keys, databases, or `node_modules`
  tracked. `.env.example` carries placeholders only and is checked by
  `tooling/security/verify-no-real-project-refs.mjs` (HI-05). The development
  project ref does still appear in historical evidence — `docs/program/` and
  `tooling/eval/simulated-tenant/` — because those files record which project a
  past run used; they are evidence, not configuration, and are not read by a
  build. No credential is recorded in either place.
- Pattern scans cannot prove no credential ever existed; no values are
  printed here.

## CI workflow review

`.github/workflows/ci.yml` is fit for its stated purpose: least-privilege
`permissions: contents: read`, pinned Node/pnpm versions, frozen lockfile
install, four jobs (workspace, database, desktop, audit), no deploy or
release job, and no secret exposure on pull requests. Third-party actions
are tag-pinned, not SHA-pinned. Hosted execution was not observed (no push).

## Remaining limitations (not waived)

- Hosted GitHub Actions, branch protection, repository visibility, and
  remote state were **not verified** (push prohibited in this audit).
- The unreadable `.sha256` evidence file (above) needs owner action on a
  healthy filesystem.
- The product remains a prototype: unsafe-answer/recall limits are recorded
  in the README; hosted telemetry/escalation transport is not wired into the
  standalone demo; no external security audit or certified isolation is
  claimed. Production prerequisites remain open.

**Status: locally verified, not shipment-ready.** The 2026-11-13 gate runs
above are reproducible, but the open ledger findings (HI-02 real-client XSS and
the un-triaged 641-hit history scan, among others) and the limitations above
are unresolved. Nothing was pushed, published, released, or deployed.
