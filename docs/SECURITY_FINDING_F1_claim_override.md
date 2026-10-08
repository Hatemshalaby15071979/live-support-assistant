# Security finding F-1 — an `authenticated` role can re-point its own tenant claim

**Found.** 2026-10-08, by the fleet isolation suite (`supabase/tests/rls_bypass_fleet.sql`,
section "claim override capability"), owner's `verify:db` on `ac9b0ef`.
**Status.** **ACCEPTED — option D (accept as defence-in-depth)**, owner decision **2026-10-08**. The
DB-level property is unchanged and platform-inherent; it is **not** fixed at the database level.
Conditions and the review date are in **§8**. Branch `prog/p5-security` is not merged.
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

## 4. Fix options — DB level. None applied.

| # | Option | Cost | Risk / limit |
| --- | --- | --- | --- |
| A | `REVOKE EXECUTE ON FUNCTION pg_catalog.set_config(text,text,boolean) FROM PUBLIC` | Low | **Does not close it.** `SET request.jwt.claims = '…'` is a command, not a function call; custom GUCs stay writable. Partial only. |
| B | Move the trust anchor: make `app.current_tenant()` resolve the tenant from a `SECURITY DEFINER` function that validates the claim against `users` (sub exists, sub's tenant matches the claimed tenant) | Medium | Closes the *bogus-sub* case only. A caller who knows a real user id in the target tenant still passes. Not a full fix. |
| C | Snapshot the claim once per request: `authenticator` captures the verified claims into a `SECURITY DEFINER`-only table at request start; RLS reads the snapshot, never the live GUC | High | Requires a hook on every request path (PostgREST pre-request) and a migration; the largest change, the only one that actually removes the client's influence. |
| D | Accept as defence-in-depth: rely on the transport (no caller SQL — §3) plus the surface audit (§2) as a regression guard | Low | The property remains true at the DB level. Any *future* exposed function that takes text and builds SQL converts a latent hazard into a live one — the audit is the tripwire. **← ACCEPTED by the owner, 2026-10-08 (§8)** |

**Is there a clean DB-level option?** **No.** PostgreSQL 17 (the test container) and the Supabase
target both treat custom GUCs as user-settable with no per-role ACL; there is no supported
`ALTER ROLE … DENY SET` for a placeholder GUC. Only option C changes the trust anchor, and it is a
structural change, not a hardening tweak.

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
- **Residual risk:** the DB-level property is **real and unmitigated**; the mitigation is
  architectural (no caller SQL) and enforced by a test, not by the database.
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

## 8. Acceptance — option D (owner, 2026-10-08)

**Decision.** The owner **accepts F-1 as option D**: a documented, platform-inherent risk, mitigated
architecturally (the shipped transport exposes no caller SQL — §3) and guarded by a test (the surface
audit — §2). It is **not** fixed at the database level and no DB-level fix is applied.

**Why D and not C.** Option C (snapshot the verified claim per request behind a `SECURITY DEFINER`
boundary) is the only option that removes the client's influence over the trust anchor, and it is a
structural change: a hook on every request path plus a migration. It is deferred until a trigger
exists — condition 4 below. Options A and B are partial and were rejected on their own merits (§4).

### Conditions of acceptance

| # | Condition | Where it is enforced |
| --- | --- | --- |
| 1 | **The tripwire stays.** `rls_surface_audit.sql` remains a required suite in `pnpm run verify:db`. It **FAILS** if any function executable by `authenticated`/`anon` contains **dynamic SQL**, and it **reports** (`REVIEW`) any that calls `set_config`. Neither the failure rule nor the review line may be removed. | `tooling/db/verify-phase7.sh` (suite 6); `supabase/tests/rls_surface_audit.sql` |
| 2 | **The 7 section-4b probes keep failing.** They are the live proof that the property is unmitigated. A green fleet suite is a **regression**, not a success — the probes must not be weakened, skipped, reclassified, or have their expectation changed. | `supabase/tests/rls_bypass_fleet.sql`, section 4b |
| 3 | **`anon` coverage is proven on a hosted run.** The local stack has no `anon` role, so its coverage is **UNPROVEN LOCALLY**. Acceptance carries this as an open obligation, not a satisfied one. | `rls_surface_audit.sql` role-coverage section |
| 4 | **Option C is taken up if an RPC with a text parameter is ever added** — any exposed function that takes caller text which can reach SQL, or that calls `set_config` with caller input. That converts the latent hazard into a live one, and condition 1 is the tripwire that is expected to fire first. | the surface audit (condition 1) |

### Review

**Review date: 2027-01-06** (90 days from acceptance). The review re-checks:

1. conditions 1–4 still hold, and the audit has not been weakened;
2. whether any RPC with a text parameter has been added since acceptance;
3. whether `anon` coverage has been shown on a hosted project (condition 3);
4. whether a platform change — a Supabase or PostgreSQL release that gives custom GUCs a per-role
   ACL — makes option A or B viable and D no longer necessary.

### What acceptance does NOT mean

- It does **not** mean the property is safe at the database level. It is not; it is **accepted**.
- It does **not** license removing the audit, weakening section 4b, or reporting the fleet suite as
  green. Condition 2 is explicit: the 7 failures are the expected state.
- It does **not** change the severity (Medium, §5). Severity describes the property, not the decision.
- It does **not** authorise merging `prog/p5-security`; that is a separate owner decision.
