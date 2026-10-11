# Full-history secret scan — 2026-10-11

**Target branch:** `prog/xss-real-client`
**HEAD:** `d1d6052497524e66d25b2b11fb0c167fa0855a28`
**Scope:** all local refs, all reachable history, with `git log --all -p -G` pickaxe searches by category. Candidate values were kept out of logs and this report.

## Verdict: CLEAN — dispositioned

The earlier report incorrectly marked the scan incomplete: its password assignment expression did not match the pickaxe’s regex dialect, and its JWT/email patterns over-escaped the literal dot. The scan was repaired by searching history with category pickaxes and independently extracting candidate lines in memory. No candidate credential value or email local-part was printed.

| Category | Result | Disposition |
|---|---:|---|
| Password assignments | 2 candidate lines, 1 commit/file | Both in `tooling/db/verify-hosted.sh`: one reads `SUPABASE_DB_PASSWORD` from the environment or ignored `.env.local`; one passes it to `psql` through `PGPASSWORD`. No literal password is stored. |
| Secret/API-key assignments | 2 candidate lines, 1 commit/file | Both active `supabase/config.toml` values are `env(...)` references (`OPENAI_API_KEY` and provider secret), not credentials. |
| JWT shape | 0 | No matching token-shaped values. |
| Private-key block headers/footers | 0 | No key material block found. |
| Credential-bearing PostgreSQL/HTTP URLs | 0 | No username/password URL found. |
| Email addresses | 304 changed-line candidates, 40 commits, 42 files; 42 domains | The earlier full-history disposition in `AGENTS.md` § “Scan-scope correction” covers synthetic `.example`/test/placeholder principals, planted-PII fixtures, public-wording corpus contacts, upstream attribution, and the owner’s public contact. The final pass mapped the 304 candidates across fixture/config code, planted-PII generators, corpus provenance and source snapshots, vendored/npm attribution, and README owner contact; the 42 domains fall within those already documented safe classes. Local-parts remained masked. No real user address was found. |
| DB host/project-ref indicators | 12 changed-line candidates, 4 commits, 5 files | Public-by-design project refs and pooler/host references in configuration, documentation, and verification tooling; credential-bearing URL scan was zero. |

The prior ledger’s 298 email-line count described a narrower range diff and is not used as the current full-history count. The current count is 304; all candidates are covered by the existing documented safe classes above.

## Method and outcome

Each category used a `git log --all -p -G` history pickaxe. The corrected JWT expression uses literal-dot matching (`\.`); email matching uses one literal-dot escape. Password and secret assignment pickaxes were broad keyword searches, then candidate assignments were extracted and inspected with values redacted. A repair attempt using POSIX character classes in Python failed to extract candidates. I then used broad Git keyword pickaxes followed by compatible in-memory assignment extraction; the final rerun after the renormalization commit found 2 password-assignment candidates (both environment-fed references in the same script), 2 secret-assignment candidates (both environment substitutions in the same config), 0 JWTs, 0 private-key blocks, 0 credential-bearing URLs, and 304 email-line candidates across the already-dispositioned safe classes. The validated run found only the dispositioned candidates above.

**Push authorization:** this scan is clean. This report does not authorize a push; the active task explicitly says do not push.
