# Security finding F-1 — an `authenticated` role can re-point its own tenant claim

**Found.** 2026-10-08, by the fleet isolation suite (`supabase/tests/rls_bypass_fleet.sql`,
section "claim override capability"), owner's `verify:db` on `ac9b0ef`.
**Status.** **FIXED — G5, 2026-11-13.** The client-spoofable path (`authenticated` calling
`set_config('request.jwt.claims', …)`) is closed by migration
`20261113000000_fix_tenant_claim_spoof.sql`, which revokes `EXECUTE` on `pg_catalog.set_config`
from `anon` and `authenticated`. The fleet suite (suite 4) is now expected green; the old
"7 failures are the expected state / green = regression" convention is withdrawn. The remaining
direct-DB-session `SET` vector and its governance are in **§8**. Branch `prog/p5-security` is
not merged.
**Plain-English version for the owner: `docs/program/F1-plain-english.md`** (added 2026-10-09).
**Severity.** **Medium** — see §5 for the reasoning and the preconditions. It is **not** Low.
Severity describes the property, not the acceptance decision.

---

## 1. Minimal reproduction (plain SQL)

```sql
begin;
  -- the platform's own step: PostgREST sets the claims from the verified JWT
  select set_config('request.jwt.claims',
    '{"sub":"a0000000-0000-0000-0000-000000000001",
      "app_metadata":{"tenant_id":"11111111-1111-1111-1111-111111111111","app_role":"ops_manager"}}',
    true);
  set local role authenticated;

  -- THE EXPLOIT: re-point the claim from inside the authenticated role
  select set_config('request.jwt.claims',
    '{"sub":"a0000000-0000-0000-0000-000000000001",
      "app_metadata":{"tenant_id":"22222222-2222-2222-2222-222222222222","app_role":"ops_manager"}}',
    true);

  select tenant_id, count(*) from sops group by tenant_id;   -- returns Beta's rows
rollback;
```

**Observed** (owner's `verify:db`, not re-run here — no Docker on this host): the probe reported
**`rows:3` on `sops`**, for all five Alpha roles (`ops_manager`, `sop_editor`, `team_lead`,
`agent`, `auditor`), 7/7 probes failed.

**Which tenant do the returned rows belong to?** The **target** tenant — `22222222-2222-2222-2222-222222222222`
(Beta), i.e. **not** the caller's home tenant (`11111111-…`, Alpha). The probe reads
`select 1 from sops where tenant_id = <Beta>` and gets 3 rows, so the rows are Beta's own sops.
This is a genuine cross-tenant read; it is not the caller seeing their own rows.

**Mechanism.** RLS trusts the claim:
```sql
create policy sops_select on sops for select to authenticated
  using (tenant_id = app.current_tenant());
-- app.current_tenant() = nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', '')::uuid
-- auth.jwt()           = coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
```
`request.jwt.claims` is a **custom GUC**, and PostgreSQL gives custom GUCs no per-role write ACL:
any role may set one with `SET` or `set_config()`. So a role that can run SQL inside the request
transaction can change which tenant RLS believes it is.

## 2. Surface audit (compensating control)

`supabase/tests/rls_surface_audit.sql` — enumerates every function in the exposed schemas that
`authenticated` or `anon` may EXECUTE (`has_function_privilege`), records SECURITY DEFINER/INVOKER,
whether the body contains dynamic SQL, whether it calls `set_config`, and its text parameters.
**The suite FAILS if any callable function contains dynamic SQL.** Run:
`psql -f supabase/tests/rls_surface_audit.sql`. Verdict line: `SURFACE AUDIT OK` / `… FAILED`.

## 3. Exposure — evidence only

- `supabase/config.toml` `[api]`: `schemas = ["public", "graphql_public", "app"]`. `app` **is**
  exposed (the client's RPCs live there); `public` holds the tables; `pg_catalog` is **not** exposed,
  so `pg_catalog.set_config` is unreachable from a client.
- Edge functions `publish-bundle` and `upsert-sop` use `createClient(...).rpc(...)` / `.from(...)`
  — parameterised PostgREST calls. **No raw SQL, no `set_config`, no string-built queries** in
  either function.
- The only `execute format(...)` sites in the migrations are in `retention.sql` (drop partition,
  revoke) and `ingest_throttle.sql` (revoke) — maintenance functions, operating on internal
  identifiers, revoked from `public`/`anon`/`authenticated` by the same files.
- **Conclusion:** no shipped edge function and no exposed RPC accepts caller-supplied SQL, and none
  calls `set_config` with caller input. So F-1 is **not reachable through the API as configured.**

> **AMENDMENT — 2026-10-08 (hosted evidence). The conclusion above was accurate about *shipped* code,
> and it was FALSE of the hosted project at the time it was written.**
>
> The hosted surface audit found **seven test-helper functions in the API-exposed `public` schema**
> with EXECUTE granted to `anon` and `authenticated`. Six of them take caller-supplied text into
> `execute` (`execute p_sql`; `execute format('select count(*) from (%s) q', p_query)`), so an
> `authenticated` API caller could reach the F-1 primitive through the API. They were residue from an
> earlier hosted `verify-hosted.sh` run, not shipped application surface and not migration output.
>
> Root cause: that script's cleanup dropped the helpers by **hardcoded signature**, so when the helper
> signatures changed every `drop function` became a **no-op** and the helpers survived, still granted
> to the API roles. Correlation on the hosted catalog confirmed it: every helper whose signature
> matched the old drop list was gone, every one that mismatched survived.
>
> Status of the residue: **removed** on 2026-10-08 (exact SQL and before/after evidence in
> `docs/program/hosted-helper-removal-2026-10-08.sql`); root cause **fixed** in
> `tooling/db/verify-hosted.sh`, which now discovers helper identities from the catalog (allowlist +
> exposed-schema scoped), drops them with no `CASCADE`, and **fails the run if any test helper remains
> in an API-exposed schema**. Recorded in `docs/program/DECISIONS.md` (2026-10-08).
>
> This is a **separate residue / root-cause finding**, not a re-opening of F-1's DB-level property.
> It is proven locally by `supabase/tests/helper_exposure.sql`
> (`bash tooling/db/verify-helper-exposure.sh`), which reproduces the primitive through an exposed
> helper — re-pointing the caller's own tenant claim — and shows that moving the helper out of the
> exposed surface removes the path.
>
> **The acceptance depends on a standing test:** no callable function exposed to API roles may accept
> caller-supplied SQL. `rls_surface_audit.sql` (suite 6) is that test, and the hosted verifier's
> post-run residue check now enforces the same rule on the hosted project.
>
> **The acceptance and disposition in §8 are UNCHANGED by this amendment.** The text above is left as
> written; only this note is added.

## 4. Fix options — DB level. The revoke variant (row A) is now applied under G5; options B and C remain available.

| # | Option | Cost | Risk / limit |
| --- | --- | --- | --- |
| A | `REVOKE EXECUTE ON FUNCTION pg_catalog.set_config(text,text,boolean) FROM PUBLIC` (re-grant `service_role`/`authenticator` when present) | Low | **Applied under G5 (2026-11-13) as the HI-01 fix.** Closes the `set_config()` *function* path the exploit uses, so the fleet override probes now report `denied`. Revoking only `anon`/`authenticated` is insufficient — the `PUBLIC` grant would still cover them — so the migration revokes `PUBLIC` and re-grants trusted server roles. The bare `SET request.jwt.claims = '…'` *command* stays reachable by a direct DB session — see §8. |
| B | Move the trust anchor: make `app.current_tenant()` resolve the tenant from a `SECURITY DEFINER` function that validates the claim against `users` (sub exists, sub's tenant matches the claimed tenant) | Medium | Closes the *bogus-sub* case only. A caller who knows a real user id in the target tenant still passes. Not a full fix. |
| C | Snapshot the claim once per request: `authenticator` captures the verified claims into a `SECURITY DEFINER`-only table at request start; RLS reads the snapshot, never the live GUC | High | Requires a hook on every request path (PostgREST pre-request) and a migration; the largest change, the only one that actually removes the client's influence. |
| D | Accept as defence-in-depth: rely on the transport (no caller SQL — §3) plus the surface audit (§2) as a regression guard | Low | The property would hold only via the architectural convention; any *future* exposed function that takes text and builds SQL converts a latent hazard into a live one — the audit is the tripwire. **← ACCEPTED by the owner, 2026-10-08 — REVERSED under G5 (2026-11-13); the DB-level fix (option A) is now applied, see §8.** |

**Is there a fully clean DB-level option?** Only option C (snapshot the verified claim per request
behind `SECURITY DEFINER`, via a pre-request hook) removes the client's influence entirely; it is a
structural change. The revoke in row A is applied and closes the function-call path; the bare `SET`
command remains, which is the residual documented in §8. PostgreSQL has no per-role `DENY SET` for a
placeholder GUC, so option A cannot cover the command form.

## 5. Severity — Medium

- **Preconditions:** (1) an authenticated principal (any tenant); (2) the ability to execute SQL —
  `set_config`/`SET` — **inside the same transaction as the read**. Through the shipped API the
  caller has no such ability: no exposed function takes SQL text and none calls `set_config` with
  caller input (§2, §3). A **direct database session** (psql, the session pooler with a DB
  credential) satisfies (2).
- **Impact if preconditions are met:** full cross-tenant read (and, with `app_role` in the same
  forged claim, cross-tenant write) for every table the role holds privileges on.
- **Likelihood:** **low today**, because the transport does not expose the primitive. It rises
  immediately if any future RPC accepts text that reaches SQL — which is exactly what the surface
  audit exists to catch.
- **Residual risk (post-G5 fix):** the `set_config()` *function* path is now closed at the database
  level by the HI-01 fix, so the client-spoofable exploit no longer works. What remains is the bare
  `SET request.jwt.claims = '…'` *command* from a **direct DB session** (no per-role `DENY SET` exists
  for custom GUCs); it is governed by issuing tenants no DB credentials and by the surface-audit
  tripwire, not by the engine. The architectural convention (no caller SQL) is unchanged and still
  enforced by a test.
- **Why not Low:** the impact is total tenant isolation loss, the property is permanent until
  changed, and the compensating control is a convention held by a test rather than by the engine.

## 6. Disclosure — the claim-shape section went from 700 to 630 probes

Commit `ac9b0ef` ("p5: Classify the fleet failures…"). The section previously ran **20** tenant
shapes × 5 role strings × 7 principals = 700. It now runs **18** × 5 × 7 = **630**.

**The 70 probes removed were the two REAL tenant ids** (`11111111-…`, `22222222-…`): 2 × 5 × 7 = 70.
They were **not** deleted to get green — they were **moved and made stronger**:
- The 18 remaining values (`null`, `""`, `not-a-uuid`, all-zeros, two non-existent uuids, a 40-char
  string, `\u0000`, `" "`, `"app"`, `"public"`, `"tenant_id"`, a short uuid, a long uuid, `0`,
  `true`, `[]`, `{}`) stay asserted **fail-closed**.
- The two real tenant ids are now asserted in the new **section 4b**, "claim override capability",
  which is a **strictly stronger** test: it attempts the override **from inside the authenticated
  role** rather than performing it as the superuser. That is the test that found F-1.

## 7. Vacuous probes

21 of 273 cross-tenant read probes reported `vacuous` (target tenant holds no rows). The suite's
"vacuous probes" section lists each one with the seeding outcome recorded in `fleet_fixture`
(`alpha:<sqlstate> beta:<sqlstate>`, or `ok`). They are **not** passes and are bounded at 10%.
Enumerating them by table requires the run output, which is not available on this host (no Docker);
the suite prints them on every run.

## 8. Disposition — FIXED under G5 (2026-11-13)

**Decision.** The audit (HI-01) rejected the option-D acceptance as a shipment blocker. Under G5 the
owner authorised the audit's `required_fix`: the client-spoofable path is **fixed at the database
level** by migration `20261113000000_fix_tenant_claim_spoof.sql`, which revokes `EXECUTE` on
`pg_catalog.set_config(text, text, boolean)` from `PUBLIC` — the default grant that covers `anon`/
`authenticated`; revoking only those two is insufficient because the `PUBLIC` grant persists — and
re-grants `service_role`/`authenticator` when present. PostgREST injects the
verified claims via the `SET` *command* as the `authenticator` role, so legitimate requests are
unaffected; only the `set_config()` *function* call the exploit used is removed.

**Verification.** The fleet suite (suite 4) now reports `RLS BYPASS FLEET OK` with zero failures;
the `claim override capability` probes (section 4b) report `denied:privilege` instead of a
cross-tenant read. `rls_surface_audit.sql` still runs as a required suite and fails the build on any
exposed function that takes caller SQL or calls `set_config`.

**Residual (honest scope).** A direct database session holding a tenant credential could still use the
bare `SET request.jwt.claims = '…'` *command* — PostgreSQL has no per-role `DENY SET` for custom
GUCs. This is governed by (a) tenants are never issued database credentials, and (b) the
`rls_surface_audit` tripwire above. The deeper zero-residual fix (option C: snapshot the verified
claim per request behind `SECURITY DEFINER` via a pre-request hook) remains available if the owner
wants it; it was not required to close HI-01.

**Gone conventions.** The earlier "7 failures are the expected state" and "a green fleet suite is a
regression" rules are withdrawn — a green fleet suite is now the **pass** state.

**Severity.** The original property was Medium (§5); it is now mitigated at the trust anchor. Severity
described the property, not the decision.

**Merge.** `prog/p5-security` remains a separate owner decision; this fix does not authorise it.
