# F-1 in plain English

*Written 2026-10-09 so the owner can confirm or withdraw the acceptance in about two minutes, in
plain words, without reading the full finding. The technical record is
`docs/SECURITY_FINDING_F1_claim_override.md`; the decision is `docs/program/DECISIONS.md:202-231`.*

---

## What it is, in one paragraph

On the database, a signed-in user can tell the database that they belong to a **different customer**,
and then read that customer's procedures. It takes three lines of SQL. We have reproduced it: seven
probes read another tenant's rows (`rows:3` on `sops`) across all five roles of the test tenant.

## Why we cannot just fix it

The database decides "which customer is this?" by reading a note attached to the request. PostgreSQL
gives that note no per-role lock — any role may rewrite it. So this cannot be closed from inside our
own code. Closing it properly is a structural change (snapshot the verified claim behind a
`SECURITY DEFINER` boundary on every request), which is option C.

## Why it is not reachable today

To use it, an attacker must be able to run **their own SQL** inside the request. Our shipped API
never lets a caller supply SQL: every endpoint is a fixed function with typed parameters. And a test
fails the build if anyone ever adds a function that builds SQL out of caller text. **The door is
real; there is no hallway to it.**

## What is not fixed

The database-level property. It is **accepted**, not solved. Severity stays **Medium** — that
describes the property, not the decision.

## What guards it — three things, all live

1. **A tripwire in the database gate.** A required suite fails the build if any function a client can
   call ever builds SQL. It also flags any that touches the claim note.
2. **Seven deliberately failing probes.** They are the standing proof that the property is
   unmitigated. A green fleet suite is a **regression**, not a success.
3. **No caller SQL anywhere in the API.** Verified by the tripwire above, on every run.

## The four conditions of acceptance

| # | In plain words |
| --- | --- |
| 1 | The tripwire stays. Its failure rule and its review line may not be removed. |
| 2 | The 7 probes keep failing. They may not be weakened, skipped or reclassified. |
| 3 | `anon` coverage must be proven on a hosted run. **Done** — hosted run, 2026-10-08. |
| 4 | If anyone ever adds an endpoint that takes caller text into SQL, option C gets built. |

## The review

**2027-01-06** (90 days). It re-checks the four conditions, whether a text-parameter endpoint has
appeared, and whether a platform release gives the claim note a per-role lock — which would make
option C unnecessary.

## Status (updated 2026-11-13, G5/HI-01)

F-1 is **fixed**, not awaiting an accept/withdraw choice. Under G5 the owner authorised the audit's
`required_fix`: the `set_config` override path was closed by revoking `EXECUTE` on
`pg_catalog.set_config` from `anon`/`authenticated` (migration `20261113000000_fix_tenant_claim_spoof.sql`),
so the fleet suite (`verify:db` suite 4) is now **green** and the old "7 failing probes = expected"
convention is withdrawn. A residual direct-DB-session `SET` vector remains and is documented in
`docs/SECURITY_FINDING_F1_claim_override.md` §8; option C (pre-request hook snapshot) would close it
fully if you later want zero residual.

<details>
<summary>Original decision prompt (kept for history)</summary>

Confirm or withdraw, in your own words. Either is fine and both are honest:

- **"F-1 accepted"** — the record stands, the tripwire and the 7 failing probes stay, review 2027-01-06.
- **"F-1 not accepted"** — then either option C gets built, or the database gate knowingly goes red.
  It cannot simply be marked otherwise: `verify:db` refuses to treat the red as expected unless the
  record says ACCEPTED, so withdrawing the acceptance **fails the database gate by design**.
</details>

**Current state while you decide:** accepted on conditions per your instruction of 2026-10-09, and
awaiting this plain-English re-confirmation. Nothing about the database has been changed.
