# History secret scan: stale exception IDs after history rewrite

## Finding

The first `node tooling/security/scan-history-secrets.mjs` run on `prog/main` exited 2. Fourteen exact exception entries referred to commits removed from the reachable graph by the repository's recorded `git-filter-repo` rewrite. The scanner correctly refused to call that result clean.

## Resolution

Mapped each exception's old full commit SHA through `.git/filter-repo/commit-map`; preserved the path, operation, content hash, category, and review reason. A scan using the proposed registry matched all 14 exception IDs to their rewritten occurrences, inspected 235/235 reachable commits and 1,002,077 changed lines, and found zero hard-category hits. Updated the committed registry to those verified rewritten SHAs and saved the redacted scan evidence at `docs/program/evidence/live-support-history-scan-2026-11-05.json`.

The first run of `verify-history-secret-scanner.mjs` in the restricted execution sandbox failed controls that spawn child processes, so it did not establish a clean self-test. Re-running with subprocess execution enabled passed all 17/17 controls. The full-history scan and self-test both pass on the pre-commit tip. Re-run the full-history scan on the final committed tip before any push.

## Scope and disposition

No exception was removed, broadened, or weakened. Only commit identities changed to the exact rewritten commits that retain the same audited occurrences. This report does not establish hosted CI, deployment readiness, or closure of the repository's separate security and product gates.
