-- surface_audit lockdown — owner-authorized hosted action, 2026-10-08.
-- Context: public.surface_audit is a leftover artifact from the OQ-012 re-verification
-- run. It is an API-surface audit result table (10 rows, columns fn/kind/security/
-- dynamic_sql/set_config/text_params/ok/note) — no user PII. It was created with
-- ALL privileges granted to anon and authenticated, which is the wrong default for a
-- leftover diagnostic table. This transaction removes anon/authenticated access by
-- name and leaves the owner (postgres) intact. The table is NOT dropped.
--
-- ACL before: {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
--              authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}
-- ACL after : {postgres=arwdDxtm/postgres, service_role=arwdDxtm/postgres}

BEGIN;
REVOKE ALL ON public.surface_audit FROM anon, authenticated;
COMMIT;

-- Verification (run separately; must return only postgres + service_role):
-- SELECT relacl FROM pg_class
--   WHERE relname = 'surface_audit'
--     AND relnamespace = 'public'::regnamespace;
