# Security Policy

## Supported Versions

This project is in active development and has **no stable release line yet**.
Security fixes are applied to the `prog/main` integration branch and the
`main` public branch; only the latest commit on those branches is supported.

| Branch        | Supported          |
| ------------- | ------------------ |
| `prog/main`   | :white_check_mark: |
| `main`        | :white_check_mark: |
| older commits | :x:                |

If and when tagged releases exist, the two most recent minor releases will be
supported. Until then, please always test against the latest `prog/main`.

## Reporting a Vulnerability

**Do not open a public issue for a security vulnerability.**

Use GitHub's private vulnerability reporting:

1. Go to the repository's **Security** tab.
2. Choose **Report a vulnerability** (this creates a private security advisory
   visible only to maintainers).
3. Provide a description, affected commit/branch, reproduction steps, and impact.

If private reporting is unavailable, email the maintainer through the address in
their GitHub profile and encrypt if possible. Never include live credentials in
the report.

### What to include
- A clear description of the vulnerability and its impact.
- The exact commit SHA or branch where it was observed.
- Steps to reproduce (or a proof-of-concept).
- Any suggested mitigation.

## Response Times

| Phase                         | Target                         |
| ----------------------------- | ------------------------------ |
| Initial acknowledgement        | within 72 hours                |
| Triage and severity assignment | within 7 days                  |
| Status update on accepted issues | at least weekly            |
| Fix for critical/high issues   | best effort, prioritised       |

These are targets, not guarantees. You will receive an acknowledgement even if
the report is declined, with a reason.

## Scope

In scope:
- The application code in this repository (`apps/`, `packages/`, `supabase/`,
  `tooling/`).
- Authentication, tenant isolation (row-level security), and the encrypted
  bundle-delivery path.
- The CI/CD workflows under `.github/workflows`.

Out of scope:
- Third-party dependencies (report those to the upstream project; Dependabot
  will also surface them here).
- Deployed/hosted Supabase project configuration that lives outside this repo.
- Social engineering or physical attacks.

## Security Hardening Already in Place

For transparency, this repository already ships:
- A database verification gate (`tooling/db/verify-phase7.sh`) that applies every
  migration and runs tenant-isolation attack suites against a throwaway
  PostgreSQL.
- Tenant-claim spoofing protection (HI-01): `set_config` is revoked from
  `PUBLIC` so a client cannot forge its JWT tenant claim.
- A local secret-scan workflow (`.github/workflows/secret-scan.yml`).
- CodeQL analysis (`.github/workflows/codeql.yml`).

See `SHIPMENT_READINESS.md` and `docs/` for the current status of the remaining
findings; claims there are self-assessed and not a substitute for an external
audit.
