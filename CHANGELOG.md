# Changelog

All notable, user-visible changes to `live-support-assistant` are recorded here from
repository history. Dates are commit dates in `git log`.

## [Unreleased] — 2026-11-27

### Governance & CI
- Adopted the portfolio governance standard: added [`CONSTITUTION.md`](CONSTITUTION.md),
  [`GOVERNANCE.md`](GOVERNANCE.md), this `CHANGELOG.md`, and replaced the template
  [`SECURITY.md`](SECURITY.md) with a repository-accurate security policy.
- Relocated project-local `00_CONSTITUTION.md` to [`docs/00_CONSTITUTION.md`](docs/00_CONSTITUTION.md),
  `proof-of-concept.md` to [`docs/proof-of-concept.md`](docs/proof-of-concept.md), and the
  2026-11-06 `SHIPMENT_READINESS.md` snapshot to
  [`docs/archive/SHIPMENT_READINESS.md`](docs/archive/SHIPMENT_READINESS.md).
- Added the shared [`scripts/check_root_docs.py`](scripts/check_root_docs.py) gate and a
  `governance` job to [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## 2026-11-22 — Branding & README alignment

- Added the Helix Solutions header logo and attribution block to [`README.md`](README.md)
  (`cbd7473`, `8f42aee`, `9764b1f`, `445e8e0`, `810233a`).

## 2026-11-13 to 2026-11-15 — CI, mobile bundle & dependency hardening

- Upgraded `@sop/mobile` to Expo SDK 58 / React Native 0.88 and wired Android and iOS export
  checks into CI (`6e742ed`, `bbff233`, PR `#26`).
- Floored `zod` (`4.6.6`) and `minimatch` (`11.0.1`), added Dependabot configuration, and updated
  workflow actions and `@supabase/supabase-js` (`2.119.0`) (PRs `#8`–`#15`, `#21`–`#25`).
- Added `.gitleaks.toml` allowlists for owner-verified synthetic corpus fixtures (`b3c76fa`,
  PR `#7`).

## 2026-10-07 to 2026-11-05 — Program hardening & verification gates

- Added `tooling/run-verification.mjs` (17 local verification suites), `tooling/audit-gate.mjs`,
  `tooling/evidence/verify-claims.mjs`, `tooling/verify-agent-skill.mjs`, XSS render-path
  harnesses, and `tooling/security/scan-history-secrets.mjs`.
- Wired `prog/**` branch CI execution (`fed0804`), Market Twin smoke determinism (`3755b74`),
  and Postgres RBAC/RLS verification (`verify-phase7.sh`, `5b72367`).

## 2026-09-28 — Simulated validation milestone (`v1.0-simulated-validation`)

- Merged publish-path conflict blocking (HTTP 422 on contradictory tenant corpora, `8919e48`)
  and deployed-vs-local parity evidence (`5c19b3f`). See
  [`docs/RELEASE_NOTES.md`](docs/RELEASE_NOTES.md).

## 2026-08-27 to 2026-08-29 — Initial monorepo & v1.0.1

- Initial repository creation (`e754927`), `v1.0.0` production build (`13aac4f`), and
  `v1.0.1` working-tree deliverables (`8bead18`).
