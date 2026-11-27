# Security Policy

LIVE Support Assistant (`sop-escalation-engine`, `0.1.0`) is a pre-production prototype
intended for simulated evaluation and future shadow-mode pilots. It has **not** passed an
external security audit and must **not** be deployed with real customer data until the
open pilot prerequisites in [`README.md`](README.md) and [`docs/KNOWN_ISSUES.md`](docs/KNOWN_ISSUES.md)
are closed.

## Supported versions

| Version | Status |
|---|---|
| `0.1.0` (`prog/main`) | Pre-production prototype only — no production support commitment |

## Reporting a vulnerability

**Reporting contact: to be filled in by the owner.** There is no monitored security mailbox
or private reporting route published in this repository yet; do not send vulnerability
reports to any address guessed from this file or from synthetic test fixtures.

Until the owner publishes a private reporting channel (such as GitHub Private Vulnerability
Reporting):

1. Do not open a public issue containing exploit details or live tenant URLs.
2. Do not include real customer data, credentials, or personal data in any report.
3. Re-check this file before submitting after any public release.

## Controls currently in the repository

- Signed tenant procedure bundles with fail-closed loading (no bundled fallback corpus).
- Automated CI dependency audit (`pnpm run audit` against `tooling/audit-baseline.json`).
- SQL RBAC/RLS verification suites (`tooling/db/verify-phase7.sh`) and documented open
  finding F-1 (`docs/SECURITY_FINDING_F1_claim_override.md`).
- Secret-scan configuration (`.gitleaks.toml`) and full-history secret scanner
  (`tooling/security/scan-history-secrets.mjs`).
