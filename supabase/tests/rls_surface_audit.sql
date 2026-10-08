-- Surface audit — what can `authenticated` / `anon` actually EXECUTE, and can any of it run
-- caller-supplied SQL?  P5, finding F-1 (claim override).
--
-- Why this file exists. The fleet suite proved that an `authenticated` role can re-point its own
-- `request.jwt.claims` and then read another tenant's rows (finding F-1). That is only reachable
-- from inside a request transaction, which means the exploit path is: an exposed function that
-- (a) takes caller text and (b) puts it into SQL, or (c) calls `set_config` with caller input.
-- This audit enumerates the callable surface and FAILS if any of that exists.
--
-- The rule, stated once: **a function that `authenticated` or `anon` may execute must not contain
-- dynamic SQL.** Dynamic SQL is detected from `pg_proc.prosrc`, so the check is a heuristic on the
-- body — it errs toward flagging.
--
-- Run: psql -f supabase/tests/rls_surface_audit.sql

\set ON_ERROR_STOP off

drop table if exists surface_audit;

create table surface_audit (
  fn          text primary key,
  kind        text not null,
  security    text not null,
  dynamic_sql boolean not null,
  set_config  boolean not null,
  text_params text not null,
  ok          boolean not null,
  note        text
);

-- Every function in the exposed schemas that a client role may execute.
insert into surface_audit (fn, kind, security, dynamic_sql, set_config, text_params, ok, note)
select
  n.nspname || '.' || p.proname,
  case p.prokind when 'f' then 'function' when 'p' then 'procedure'
                 when 'a' then 'aggregate' when 'w' then 'window' else p.prokind::text end,
  case when p.prosecdef then 'DEFINER' else 'INVOKER' end,
  (p.prosrc ~* '(^|[^a-z_])execute[[:space:]]')  as dynamic_sql,
  (p.prosrc ~* 'set_config')                     as set_config,
  coalesce((
    select string_agg(format('%s:%s', a.argname, t.typname), ', ' order by a.ordinality)
    from unnest(p.proargnames, p.proargtypes::oid[]) with ordinality as a(argname, typ, ordinality)
    join pg_type t on t.oid = a.typ
    where t.typname in ('text', 'varchar', 'name', 'bpchar')
  ), '-'),
  -- the assertion: callable + dynamic SQL is a failure
  not (p.prosrc ~* '(^|[^a-z_])execute[[:space:]]'),
  case
    when p.prosrc ~* '(^|[^a-z_])execute[[:space:]]' and p.prosrc ~* 'set_config'
      then 'FAIL: callable function contains BOTH dynamic SQL and set_config'
    when p.prosrc ~* '(^|[^a-z_])execute[[:space:]]'
      then 'FAIL: callable function contains dynamic SQL — caller text could reach it'
    when p.prosrc ~* 'set_config'
      then 'REVIEW: callable function calls set_config; check the value is not caller-supplied'
    else null
  end
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'app', 'graphql_public')
  and p.prokind in ('f', 'p')
  and (
    has_function_privilege('authenticated', p.oid, 'EXECUTE')
    or has_function_privilege('anon', p.oid, 'EXECUTE')
  );

-- `pg_catalog` is not an exposed schema, so a client cannot reach `pg_catalog.set_config`
-- through the API. Recorded explicitly, because it is the load-bearing compensating control.
\echo ''
\echo '=== is pg_catalog reachable through the API? ==='
select case
  when exists (
    select 1 from unnest(array['public', 'graphql_public', 'app']) s
    where s = 'pg_catalog'
  ) then 'pg_catalog IS exposed — set_config would be directly callable'
  else 'pg_catalog is NOT an exposed schema — pg_catalog.set_config is unreachable from a client'
end as api_reach;

\echo ''
\echo '=== callable surface (functions executable by authenticated or anon) ==='
select fn, kind, security, dynamic_sql, set_config, text_params, coalesce(note, '')
from surface_audit
order by dynamic_sql desc, set_config desc, fn;

\echo ''
\echo '=== functions NOT callable by a client role, for contrast ==='
select count(*) as not_callable
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'app')
  and p.prokind = 'f'
  and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
  and not has_function_privilege('anon', p.oid, 'EXECUTE');

\echo ''
select case
  when exists (select 1 from surface_audit where not ok)
    then 'SURFACE AUDIT FAILED: ' || (select count(*) from surface_audit where not ok)
         || ' callable function(s) contain dynamic SQL'
  else 'SURFACE AUDIT OK — ' || (select count(*) from surface_audit)
       || ' callable function(s), none builds SQL'
end as verdict;
