-- HI-01 (G5): an authenticated/anon role must not be able to re-point its own tenant
-- claim. RLS trusts the custom GUC request.jwt.claims via app.current_tenant()
-- (see 20260925000200_tenancy_rbac.sql). PostgreSQL custom GUCs have no per-role
-- write ACL, so any role that can run SQL inside the request transaction can call
-- set_config('request.jwt.claims', <forged>, true) and read another tenant's rows.
-- That is exactly what the fleet suite's "claim override capability" probes prove.
--
-- Fix: remove EXECUTE on pg_catalog.set_config from PUBLIC. The default grant is to
-- PUBLIC, so revoking from individual roles (anon, authenticated) is NOT enough — the
-- PUBLIC grant would still cover them. PostgREST injects the verified claims via the
-- SET *command* as the authenticator role, not via the set_config() *function* call,
-- so legitimate request handling is unaffected; only the function-call path the
-- exploit uses is closed. Trusted server-side roles keep the privilege (superuser
-- bypasses it anyway; service_role/authenticator are re-granted when present).
--
-- Residual (documented in docs/SECURITY_FINDING_F1_claim_override.md): a direct
-- database session holding a tenant credential could still use the bare
-- `SET request.jwt.claims = '...'` command; PostgreSQL has no per-role DENY SET for
-- custom GUCs. This is governed by never issuing tenant DB credentials and by the
-- rls_surface_audit tripwire (it fails the build on any exposed function that takes
-- caller SQL or calls set_config). The deeper zero-residual fix (pre-request hook
-- snapshot) is a separate, larger change.
do $$
begin
  execute 'revoke execute on function pg_catalog.set_config(text, text, boolean) from public';
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function pg_catalog.set_config(text, text, boolean) to service_role';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'grant execute on function pg_catalog.set_config(text, text, boolean) to authenticator';
  end if;
end $$;
