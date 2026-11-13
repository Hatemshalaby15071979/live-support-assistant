-- HI-04 regression — app.bundle_for_device must scope to the calling USER.
--
-- Before the fix (migration 20261113010000_hi04_bundle_device_ownership.sql),
-- bundle_for_device checked only that the requested device belonged to the
-- caller's tenant. Two users in the same tenant could therefore hand each other
-- a device id and retrieve that device's wrapped content key. After the fix the
-- device must belong to auth.uid().
--
-- This file is self-contained: it provisions its own tenant, two users, two
-- devices, and a bundle wrapped for both, then asserts the cross-user fetch is
-- refused while the owner's own fetch still succeeds.
--
-- Run: psql -f supabase/tests/hi04_device_ownership.sql
-- Expects a verdict line: "HI-04 DEVICE OWNERSHIP OK".

\set ON_ERROR_STOP on
\t on

create temporary table if not exists hi04_results (
  probe    text not null,
  expected text not null,
  observed text not null,
  ok       boolean not null
);

do $$
declare
  v_tenant uuid := 'f1040000-0000-0000-0000-000000000001';
  v_u1     uuid := 'f1040000-0000-0000-0000-000000000011';
  v_u2     uuid := 'f1040000-0000-0000-0000-000000000022';
  v_d1     uuid := 'f1040000-0000-0000-0000-0000000000a1';
  v_d2     uuid := 'f1040000-0000-0000-0000-0000000000a2';
  v_claims text;
  v_res    jsonb;
begin
  -- ---- fixtures (fixed UUIDs; the DB is dropped/recreated each run) ----------
  insert into tenants (id, name) values (v_tenant, 'hi04-tenant')
    on conflict (id) do nothing;

  insert into auth.users (id) values (v_u1), (v_u2)
    on conflict (id) do nothing;

  insert into users (id, tenant_id, display_name, role) values
    (v_u1, v_tenant, 'hi04-u1', 'ops_manager'),
    (v_u2, v_tenant, 'hi04-u2', 'agent')
  on conflict (id) do nothing;

  insert into device_registrations (id, tenant_id, user_id, platform, public_key, status) values
    (v_d1, v_tenant, v_u1, 'web', 'hi04-u1-pubkey', 'active'),
    (v_d2, v_tenant, v_u2, 'web', 'hi04-u2-pubkey', 'active')
  on conflict (id) do nothing;

  -- ---- publish a bundle wrapped for BOTH devices (as U1, ops_manager) --------
  v_claims := jsonb_build_object(
    'sub', v_u1::text,
    'app_metadata', jsonb_build_object('tenant_id', v_tenant::text, 'app_role', 'ops_manager')
  )::text;
  perform set_config('request.jwt.claims', v_claims, true);

  perform app.publish_policy_bundle(
    v_tenant,
    jsonb_build_object(
      'tenantId', v_tenant::text,
      'bundleVersion', 1,
      'modelId', 'hi04-model',
      'modelRevision', 'r1',
      'quantization', 'q8',
      'payloadHash', 'deadbeef',
      'dimensions', 384,
      'iv', 'aa',
      'sopCount', 1,
      'publishedAt', '2026-01-01T00:00:00Z'
    ),
    'hi04-signature',
    '\x00'::bytea,
    jsonb_build_array(
      jsonb_build_object('deviceId', v_d1::text, 'wrappedKey', encode('\x01', 'base64')),
      jsonb_build_object('deviceId', v_d2::text, 'wrappedKey', encode('\x02', 'base64'))
    ),
    v_u1
  );

  -- ---- probe 1: U1 fetches its OWN device -> must return a bundle -----------
  v_claims := jsonb_build_object(
    'sub', v_u1::text,
    'app_metadata', jsonb_build_object('tenant_id', v_tenant::text, 'app_role', 'ops_manager')
  )::text;
  perform set_config('request.jwt.claims', v_claims, true);
  v_res := app.bundle_for_device(v_d1);
  insert into hi04_results values (
    'U1 -> D1 (own device)', 'non-null bundle', coalesce(v_res::text, 'NULL'),
    v_res is not null
  );

  -- ---- probe 2: U1 fetches U2's device (same tenant) -> must be REFUSED ------
  perform set_config('request.jwt.claims', v_claims, true);
  v_res := app.bundle_for_device(v_d2);
  insert into hi04_results values (
    'U1 -> D2 (cross-user device, same tenant)', 'NULL (refused)', coalesce(v_res::text, 'NULL'),
    v_res is null
  );

  -- ---- probe 3: U2 fetches its OWN device -> must return a bundle -----------
  v_claims := jsonb_build_object(
    'sub', v_u2::text,
    'app_metadata', jsonb_build_object('tenant_id', v_tenant::text, 'app_role', 'agent')
  )::text;
  perform set_config('request.jwt.claims', v_claims, true);
  v_res := app.bundle_for_device(v_d2);
  insert into hi04_results values (
    'U2 -> D2 (own device)', 'non-null bundle', coalesce(v_res::text, 'NULL'),
    v_res is not null
  );

  -- ---- probe 4: U2 fetches U1's device (same tenant) -> must be REFUSED ------
  perform set_config('request.jwt.claims', v_claims, true);
  v_res := app.bundle_for_device(v_d1);
  insert into hi04_results values (
    'U2 -> D1 (cross-user device, same tenant)', 'NULL (refused)', coalesce(v_res::text, 'NULL'),
    v_res is null
  );
end;
$$;

-- ------------------------------------------------------------ report ----------
select probe, expected, observed, ok from hi04_results order by probe;

do $$
begin
  if exists (select 1 from hi04_results where not ok) then
    raise exception 'HI-04 DEVICE OWNERSHIP REGRESSION FAILED';
  else
    raise notice 'HI-04 DEVICE OWNERSHIP OK';
  end if;
end;
$$;
