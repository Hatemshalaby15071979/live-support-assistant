-- Local-only regression test — the hosted-helper-residue root cause and its hardening.
--
-- PROVES, on a disposable local database and with no production data:
--   A. a helper in an API-exposed schema that takes SQL text DOES expose the dynamic-SQL
--      primitive to an API role — demonstrated by re-pointing the caller's own tenant claim,
--      which is exactly finding F-1;
--   B. moving that helper OUT of the exposed surface removes the path;
--   C. no allowlisted test helper remains exposed and callable;
--   D. a STALE hardcoded signature does not remove the helper, while discovery-based removal does;
--   D2. a BLOCKED drop does not restore EXECUTE — the revocation is committed independently;
--   E. the residue model counts a helper left in an exposed schema, and counts an unexpected
--      helper-shaped name, so either makes the hosted verifier fail.
--
-- NEVER run this against a hosted project: it creates and drops objects.
--
-- Run: bash tooling/db/verify-helper-exposure.sh   (local container only)

\set ON_ERROR_STOP off

-- ------------------------------------------------------------------ fixtures ---
drop table if exists helper_exposure_results;
create table helper_exposure_results (
  part       text not null,
  check_name text not null,
  expected   text not null,
  observed   text not null,
  ok         boolean not null
);

-- Reset this test's own objects, and any allowlisted suite helper left in an exposed schema.
-- This is the same DISCOVERY-based removal the hosted verifier performs: identities are read
-- from the catalog, so a signature change cannot silently defeat it.
do $$
declare r record;
begin
  for r in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','graphql_public','app')
      and p.proname in ('b_claims','b_no_claims','b_probe','b_read','b_anon_read',
                        'f_claims','f_raw_claims','f_record','f_probe','f_claim_override_probe',
                        'p5_claims','p5_probe','p5_read',
                        'r_expect','r_claims','r_denied','r_seed',
                        'rbac_claims','rbac_probe','rbac_probe_read')
  loop
    execute format('revoke all on function %I.%I(%s) from public, anon, authenticated', r.nspname, r.proname, r.args);
    execute format('drop function %I.%I(%s)', r.nspname, r.proname, r.args);
  end loop;
end $$;

drop function if exists public.zz_probe(text);
drop function if exists public.zz_stale(text, int);
drop view if exists public.zz_dep_view;
drop function if exists public.zz_blocked(text);
drop function if exists public.b_anon_read();
drop function if exists public.p5_unlisted();
drop function if exists test_support.zz_probe(text);
drop schema if exists test_support;

-- The helper under test: a stand-in for b_probe/p5_probe. In an EXPOSED schema, taking SQL text.
create or replace function public.zz_probe(p_sql text)
returns void language plpgsql as $fn$
begin
  execute p_sql;
end
$fn$;
grant execute on function public.zz_probe(text) to authenticated;

-- -------------------------------------------- A. exposed helper = the primitive ---
insert into helper_exposure_results (part, check_name, expected, observed, ok)
select 'A', 'public.zz_probe is dynamic SQL and callable by authenticated', 'true',
       (v.dynamic_sql and v.callable)::text, (v.dynamic_sql and v.callable)
from (
  select (p.prosrc ~* '(^|[^a-z_])execute[[:space:]]') as dynamic_sql,
         (case when exists (select 1 from pg_roles where rolname = 'authenticated')
               then has_function_privilege('authenticated', p.oid, 'EXECUTE') else false end) as callable
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'zz_probe'
) v;

-- Exercise the primitive as the API role. The injected statement re-points the caller's own
-- tenant claim — finding F-1 — using only a disposable local fixture tenant.
begin;
  set local role authenticated;
  select public.zz_probe($$select set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000000","app_metadata":{"tenant_id":"22222222-2222-2222-2222-222222222222","app_role":"ops_manager"}}',
    true)$$);
  reset role;

  insert into helper_exposure_results (part, check_name, expected, observed, ok)
  select 'A', 'the exposed helper let authenticated re-point its own tenant claim',
         '22222222-2222-2222-2222-222222222222',
         coalesce(app.current_tenant()::text, 'null'),
         app.current_tenant() = '22222222-2222-2222-2222-222222222222'::uuid;
commit;

-- --------------------------------------------- B. out of the exposed surface ---
create schema test_support;
alter function public.zz_probe(text) set schema test_support;

insert into helper_exposure_results (part, check_name, expected, observed, ok)
select 'B', 'no dynamic-SQL helper named zz_probe remains in an exposed schema', '0',
       (select count(*)::text
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public','graphql_public','app')
           and p.proname = 'zz_probe'
           and (p.prosrc ~* '(^|[^a-z_])execute[[:space:]]')),
       (select count(*)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public','graphql_public','app')
           and p.proname = 'zz_probe'
           and (p.prosrc ~* '(^|[^a-z_])execute[[:space:]]')) = 0;

revoke all on function test_support.zz_probe(text) from public, authenticated;

insert into helper_exposure_results (part, check_name, expected, observed, ok)
select 'B', 'authenticated no longer holds EXECUTE on the moved helper', 'false',
       (case when exists (select 1 from pg_roles where rolname = 'authenticated')
             then has_function_privilege('authenticated', p.oid, 'EXECUTE') else false end)::text,
       not (case when exists (select 1 from pg_roles where rolname = 'authenticated')
                 then has_function_privilege('authenticated', p.oid, 'EXECUTE') else false end)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'test_support' and p.proname = 'zz_probe';

-- ------------------------------------------------------------ C. residue rule ---
-- The rule the hosted verifier enforces: no allowlisted test helper may remain in an API-exposed
-- schema with EXECUTE held by an API role.
insert into helper_exposure_results (part, check_name, expected, observed, ok)
select 'C', 'no allowlisted test helper is exposed and callable by an API role', '0',
       (select count(*)::text
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public','graphql_public','app')
           and p.proname in ('b_claims','b_no_claims','b_probe','b_read','b_anon_read',
                             'f_claims','f_raw_claims','f_record','f_probe','f_claim_override_probe',
                             'p5_claims','p5_probe','p5_read',
                             'r_expect','r_claims','r_denied','r_seed',
                             'rbac_claims','rbac_probe','rbac_probe_read')
           and (case when exists (select 1 from pg_roles where rolname = 'authenticated')
                     then has_function_privilege('authenticated', p.oid, 'EXECUTE') else false end)),
       (select count(*)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public','graphql_public','app')
           and p.proname in ('b_claims','b_no_claims','b_probe','b_read','b_anon_read',
                             'f_claims','f_raw_claims','f_record','f_probe','f_claim_override_probe',
                             'p5_claims','p5_probe','p5_read',
                             'r_expect','r_claims','r_denied','r_seed',
                             'rbac_claims','rbac_probe','rbac_probe_read')
           and (case when exists (select 1 from pg_roles where rolname = 'authenticated')
                     then has_function_privilege('authenticated', p.oid, 'EXECUTE') else false end)) = 0;

-- ------------------------- D. STALE signature is a no-op; discovery removes it ---
create or replace function public.zz_stale(a text, b int)
returns void language plpgsql as $fn$
begin
  execute a;
end
$fn$;

-- The stale form: the old cleanup would have dropped zz_stale(text) — but the real signature is
-- zz_stale(text,int), so that drop does nothing.
do $d$
begin
  begin
    execute 'drop function public.zz_stale(text)';
    insert into helper_exposure_results (part, check_name, expected, observed, ok)
    values ('D', 'a stale-signature drop leaves the helper in place', 'no-op', 'unexpectedly dropped', false);
  exception when undefined_function then
    insert into helper_exposure_results (part, check_name, expected, observed, ok)
    values ('D', 'a stale-signature drop leaves the helper in place', 'no-op', 'no-op: function does not exist', true);
  end;
end
$d$;

insert into helper_exposure_results (part, check_name, expected, observed, ok)
select 'D', 'the helper is still present after the stale-signature drop', '1',
       (select count(*)::text
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'zz_stale'),
       (select count(*)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'zz_stale') = 1;

-- Discovery-based removal — the repaired approach — removes it by its exact identity.
do $d$
declare r record;
begin
  for r in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','graphql_public','app') and p.proname = 'zz_stale'
  loop
    execute format('drop function %I.%I(%s)', r.nspname, r.proname, r.args);
  end loop;
end
$d$;

insert into helper_exposure_results (part, check_name, expected, observed, ok)
select 'D', 'discovery-based removal removes it by exact identity', '0',
       (select count(*)::text
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'zz_stale'),
       (select count(*)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'zz_stale') = 0;

-- --------------------- D2. a BLOCKED drop must not restore EXECUTE ---------------
-- The containment revoke is committed INDEPENDENTLY of the drop. Here the drop is blocked by a
-- dependent SQL function, so it fails; the revoke must survive that failure.
create or replace function public.zz_blocked(p_sql text)
returns int language plpgsql as $fn$
begin
  execute p_sql;
  return 1;
end
$fn$;
grant execute on function public.zz_blocked(text) to authenticated;

-- A VIEW records a real dependency on the function it calls, so the drop below is refused.
-- (A string-bodied SQL function does NOT record one — verified: it failed to block the drop.)
create view public.zz_dep_view as select public.zz_blocked('select 1') as x;

-- PHASE 1 equivalent — containment, committed on its own (autocommit statement).
revoke all on function public.zz_blocked(text) from public, authenticated;

-- PHASE 2 equivalent — the drop, no CASCADE, and it is blocked.
do $d$
begin
  begin
    execute 'drop function public.zz_blocked(text)';
    insert into helper_exposure_results (part, check_name, expected, observed, ok)
    values ('D', 'a blocked drop without CASCADE fails', 'blocked', 'unexpectedly dropped', false);
  exception when dependent_objects_still_exist then
    insert into helper_exposure_results (part, check_name, expected, observed, ok)
    values ('D', 'a blocked drop without CASCADE fails', 'blocked', 'blocked by a dependent object', true);
  end;
end
$d$;

insert into helper_exposure_results (part, check_name, expected, observed, ok)
select 'D', 'a blocked drop does not restore EXECUTE', 'false',
       (case when exists (select 1 from pg_roles where rolname = 'authenticated')
             then has_function_privilege('authenticated', p.oid, 'EXECUTE') else false end)::text,
       not (case when exists (select 1 from pg_roles where rolname = 'authenticated')
                 then has_function_privilege('authenticated', p.oid, 'EXECUTE') else false end)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'zz_blocked';

-- teardown for D2
drop view if exists public.zz_dep_view;
drop function if exists public.zz_blocked(text);

-- ------------------------------- E. the residue model actually counts ----------
-- An allowlisted NAME left in an exposed schema must count as residue …
create or replace function public.b_anon_read() returns void language plpgsql as $fn$
begin
  execute 'select 1';
end
$fn$;
grant execute on function public.b_anon_read() to authenticated;

insert into helper_exposure_results (part, check_name, expected, observed, ok)
select 'E', 'an allowlisted helper in an exposed schema counts as residue', '1',
       (select count(*)::text
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public','graphql_public','app')
           and p.proname in ('b_claims','b_no_claims','b_probe','b_read','b_anon_read',
                             'f_claims','f_raw_claims','f_record','f_probe','f_claim_override_probe',
                             'p5_claims','p5_probe','p5_read',
                             'r_expect','r_claims','r_denied','r_seed',
                             'rbac_claims','rbac_probe','rbac_probe_read')),
       (select count(*)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public','graphql_public','app')
           and p.proname in ('b_claims','b_no_claims','b_probe','b_read','b_anon_read',
                             'f_claims','f_raw_claims','f_record','f_probe','f_claim_override_probe',
                             'p5_claims','p5_probe','p5_read',
                             'r_expect','r_claims','r_denied','r_seed',
                             'rbac_claims','rbac_probe','rbac_probe_read')) = 1;

-- … and a helper-SHAPED name that is NOT allowlisted must count as unexpected.
create or replace function public.p5_unlisted() returns void language plpgsql as $fn$
begin
  execute 'select 1';
end
$fn$;

insert into helper_exposure_results (part, check_name, expected, observed, ok)
select 'E', 'a helper-shaped non-allowlisted name counts as unexpected', '1',
       (select count(*)::text
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public','graphql_public','app')
           and p.proname ~ '^(b_|f_|p5_|r_|rbac_)'
           and p.proname not in ('b_claims','b_no_claims','b_probe','b_read','b_anon_read',
                                 'f_claims','f_raw_claims','f_record','f_probe','f_claim_override_probe',
                                 'p5_claims','p5_probe','p5_read',
                                 'r_expect','r_claims','r_denied','r_seed',
                                 'rbac_claims','rbac_probe','rbac_probe_read')),
       (select count(*)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public','graphql_public','app')
           and p.proname ~ '^(b_|f_|p5_|r_|rbac_)'
           and p.proname not in ('b_claims','b_no_claims','b_probe','b_read','b_anon_read',
                                 'f_claims','f_raw_claims','f_record','f_probe','f_claim_override_probe',
                                 'p5_claims','p5_probe','p5_read',
                                 'r_expect','r_claims','r_denied','r_seed',
                                 'rbac_claims','rbac_probe','rbac_probe_read')) = 1;

-- removing both returns the model to zero — the state the hosted verifier requires
drop function if exists public.b_anon_read();
drop function if exists public.p5_unlisted();

insert into helper_exposure_results (part, check_name, expected, observed, ok)
select 'E', 'after removal the residue model reads zero on both counters', '0|0',
       (select count(*)::text
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public','graphql_public','app')
           and p.proname in ('b_claims','b_no_claims','b_probe','b_read','b_anon_read',
                             'f_claims','f_raw_claims','f_record','f_probe','f_claim_override_probe',
                             'p5_claims','p5_probe','p5_read',
                             'r_expect','r_claims','r_denied','r_seed',
                             'rbac_claims','rbac_probe','rbac_probe_read'))
         || '|' ||
       (select count(*)::text
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public','graphql_public','app')
           and p.proname ~ '^(b_|f_|p5_|r_|rbac_)'
           and p.proname not in ('b_claims','b_no_claims','b_probe','b_read','b_anon_read',
                                 'f_claims','f_raw_claims','f_record','f_probe','f_claim_override_probe',
                                 'p5_claims','p5_probe','p5_read',
                                 'r_expect','r_claims','r_denied','r_seed',
                                 'rbac_claims','rbac_probe','rbac_probe_read')),
       ((select count(*)
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname in ('public','graphql_public','app')
            and p.proname in ('b_claims','b_no_claims','b_probe','b_read','b_anon_read',
                              'f_claims','f_raw_claims','f_record','f_probe','f_claim_override_probe',
                              'p5_claims','p5_probe','p5_read',
                              'r_expect','r_claims','r_denied','r_seed',
                              'rbac_claims','rbac_probe','rbac_probe_read')) = 0
        and
        (select count(*)
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname in ('public','graphql_public','app')
            and p.proname ~ '^(b_|f_|p5_|r_|rbac_)'
            and p.proname not in ('b_claims','b_no_claims','b_probe','b_read','b_anon_read',
                                  'f_claims','f_raw_claims','f_record','f_probe','f_claim_override_probe',
                                  'p5_claims','p5_probe','p5_read',
                                  'r_expect','r_claims','r_denied','r_seed',
                                  'rbac_claims','rbac_probe','rbac_probe_read')) = 0);

-- ---------------------------------------------------------------- teardown ---
drop function if exists test_support.zz_probe(text);
drop schema if exists test_support;

-- ---------------------------------------------------------------- verdict ---
\echo ''
\echo '=== helper exposure results ==='
select part, check_name, expected, observed, ok from helper_exposure_results order by part, check_name;

\echo ''
\echo '=== failures ==='
select part, check_name, expected, observed from helper_exposure_results where not ok order by part, check_name;

\echo ''
select case
  when count(*) = 0 then 'HELPER EXPOSURE OK'
  else 'HELPER EXPOSURE FAILED: ' || count(*) || ' check(s)'
end as verdict
from helper_exposure_results
where not ok;

drop table if exists helper_exposure_results;
