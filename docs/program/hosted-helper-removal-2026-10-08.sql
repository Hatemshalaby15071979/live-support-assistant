-- Hosted helper-residue removal — executed 2026-10-08.
--
-- TARGET   : hosted Supabase project ref lxlokqtowvaesxjishqz, session pooler
--            (aws-1-eu-west-1.pooler.supabase.com:5432). The same database the
--            hosted surface audit ran against.
-- WHY      : seven test-harness helper functions were left behind in the API-exposed
--            `public` schema with EXECUTE granted to anon and authenticated. Six of them
--            take caller-supplied text into `execute`, i.e. they expose the F-1 primitive
--            through the API. See docs/program/DECISIONS.md, 2026-10-08.
-- APPROVAL : explicit owner authorization, Hatem Shelby, 2026-10-08.
-- SCOPE    : these seven functions only. No policy change, no table drop, no auth change,
--            no migration, no CASCADE, no change to rls_auto_enable or graphql_public.graphql.
-- SECRETS  : none. The password was read from the gitignored .env.local into a temporary
--            env file passed via --env-file and deleted afterwards; it never appears here
--            and never appeared on a command line.
--
-- ---------------------------------------------------------------------------
-- 0. BEFORE — read-only enumeration of the exact hosted identities
-- ---------------------------------------------------------------------------
--   select p.oid::regprocedure::text as identity, pg_get_userbyid(p.proowner) as owner,
--          has_function_privilege('anon',p.oid,'EXECUTE') as anon_exec,
--          has_function_privilege('authenticated',p.oid,'EXECUTE') as auth_exec
--   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public'
--     and p.proname in ('b_probe','b_read','b_anon_read','p5_probe','p5_read','rbac_probe_read','rbac_claims')
--   order by 1;
--
--   Result (7 rows, all owner postgres, anon_exec = t, auth_exec = t):
--     b_anon_read(text,text,text,integer)
--     b_probe(text,app_role,uuid,uuid,text,text,text,text,text)
--     b_read(text,app_role,uuid,uuid,text,text,integer)
--     p5_probe(text,app_role,uuid,uuid,text,text,text,text,text)
--     p5_read(text,app_role,uuid,uuid,text,text,integer)
--     rbac_claims(app_role,uuid,uuid)
--     rbac_probe_read(text,app_role,uuid,uuid,text,text,integer)
--
--   Expanded ACLs: PUBLIC, anon, authenticated, postgres and service_role each held
--   EXECUTE on every one of the seven.
--
--   Dependency pre-check (would have blocked a no-CASCADE drop):
--     select count(*) from pg_depend d
--     where d.refobjid in (select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--                          where n.nspname='public' and p.proname in (...))
--       and d.deptype <> 'i';
--   Result: 0 rows. No dependent objects.

-- ---------------------------------------------------------------------------
-- 1. THE TRANSACTION — exactly what was executed, in one transaction
-- ---------------------------------------------------------------------------
-- Run with: psql -v ON_ERROR_STOP=1  (so any failure aborts before COMMIT)

begin;

revoke execute on function public.b_anon_read(text,text,text,integer)                                  from anon, authenticated, public;
revoke execute on function public.b_probe(text,app_role,uuid,uuid,text,text,text,text,text)            from anon, authenticated, public;
revoke execute on function public.b_read(text,app_role,uuid,uuid,text,text,integer)                    from anon, authenticated, public;
revoke execute on function public.p5_probe(text,app_role,uuid,uuid,text,text,text,text,text)           from anon, authenticated, public;
revoke execute on function public.p5_read(text,app_role,uuid,uuid,text,text,integer)                   from anon, authenticated, public;
revoke execute on function public.rbac_claims(app_role,uuid,uuid)                                      from anon, authenticated, public;
revoke execute on function public.rbac_probe_read(text,app_role,uuid,uuid,text,text,integer)           from anon, authenticated, public;

drop function public.b_anon_read(text,text,text,integer);
drop function public.b_probe(text,app_role,uuid,uuid,text,text,text,text,text);
drop function public.b_read(text,app_role,uuid,uuid,text,text,integer);
drop function public.p5_probe(text,app_role,uuid,uuid,text,text,text,text,text);
drop function public.p5_read(text,app_role,uuid,uuid,text,text,integer);
drop function public.rbac_claims(app_role,uuid,uuid);
drop function public.rbac_probe_read(text,app_role,uuid,uuid,text,text,integer);

commit;

-- psql output: BEGIN, 7x REVOKE, 7x DROP FUNCTION, COMMIT. Exit status 0.

-- ---------------------------------------------------------------------------
-- 2. AFTER — read-only verification
-- ---------------------------------------------------------------------------
--   select count(*) as remaining from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public'
--     and p.proname in ('b_probe','b_read','b_anon_read','p5_probe','p5_read','rbac_probe_read','rbac_claims');
--   Result: 0
--
--   select p.proname, a.grantee::regrole::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   cross join lateral aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a
--   where n.nspname='public'
--     and p.proname in ('b_probe','b_read','b_anon_read','p5_probe','p5_read','rbac_probe_read','rbac_claims');
--   Result: 0 rows — no EXECUTE grant remains for any helper name.
--
--   Unrelated-function control:
--   select n.nspname||'.'||p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where (n.nspname='public' and p.proname='rls_auto_enable')
--      or (n.nspname='graphql_public' and p.proname='graphql');
--   Result: graphql_public.graphql, public.rls_auto_enable — both still present, untouched.
--
-- ---------------------------------------------------------------------------
-- 3. NOT DONE HERE (deliberately)
-- ---------------------------------------------------------------------------
--   * No policy was altered. No table was dropped. No auth object was touched.
--   * rls_auto_enable and graphql_public.graphql were NOT touched (platform-owned;
--     rls_auto_enable returns event_trigger and cannot be called directly).
--   * The migration drift (13 hosted vs 16 local) was NOT reconciled.
--   * verify-hosted.sh was NOT run, and no hosted suite was run, before or after.
