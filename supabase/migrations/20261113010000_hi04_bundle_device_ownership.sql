-- HI-04 — scope bundle_for_device to the calling USER, not just the tenant.
--
-- app.bundle_for_device (created in 0014) is SECURITY DEFINER. It checked that
-- the requested device belonged to the caller's TENANT, but not to the caller's
-- USER. Two users in the same tenant could therefore pass each other's device id
-- and retrieve that device's wrapped content key (bundle_for_device returns the
-- manifest, signature, ciphertext, and the wrapped key for the named device).
--
-- The wrapped key is encrypted to the other device's public key, so it cannot be
-- decrypted by the attacker — but the function must not confirm whether a foreign
-- device exists, and must not surface another user's row at all. The fix narrows
-- the check to auth.uid() (the authenticated user from the JWT). Because
-- device_registrations.user_id -> tenant_id, requiring the user owner is strictly
-- narrower than the tenant check it refines, and the legitimate "device fetches
-- its own bundle" path is unchanged.
--
-- Additive migration: re-defines the function with the tighter predicate. The
-- existing grant/revoke is preserved.

create or replace function app.bundle_for_device(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_tenant uuid;
  v_user   uuid;
  v_bundle policy_bundles;
  v_wrapped bytea;
begin
  v_tenant := app.current_tenant();
  v_user   := auth.uid();

  -- A request with no tenant or no user claim cannot address any device. The
  -- tenant check alone is kept as defence-in-depth; the user check is what
  -- closes the cross-user gap.
  if v_tenant is null or v_user is null then
    raise exception 'no tenant or user on this session' using errcode = '42501';
  end if;

  -- The device must belong to the authenticated USER (and therefore the tenant).
  -- Passing a device id owned by another user in the same tenant returns no
  -- bundle rather than an error, so the function does not confirm whether a
  -- foreign device exists.
  if not exists (
    select 1 from device_registrations d
     where d.id = p_device_id
       and d.tenant_id = v_tenant
       and d.user_id = v_user
  ) then
    return null;
  end if;

  select b.* into v_bundle
    from policy_bundles b
    join policy_bundle_device_keys k
      on k.tenant_id = b.tenant_id and k.bundle_version = b.bundle_version
   where b.tenant_id = v_tenant
     and k.device_id = p_device_id
     -- A bundle with no stored manifest has no signed document, so there is
     -- nothing for the client to verify a signature against. Refusing it here is
     -- the last place that can happen; after this the device simply sees no
     -- bundle and keeps serving the one it already had.
     and b.manifest is not null
   order by b.bundle_version desc
   limit 1;

  if v_bundle.id is null then
    return null;
  end if;

  select wrapped_key into v_wrapped
    from policy_bundle_device_keys
   where tenant_id = v_tenant
     and bundle_version = v_bundle.bundle_version
     and device_id = p_device_id;

  return jsonb_build_object(
    'manifest', v_bundle.manifest,
    'signature', v_bundle.signature,
    'payloadCiphertext', encode(v_bundle.payload_ciphertext, 'base64'),
    'wrappedContentKey', encode(v_wrapped, 'base64')
  );
end;
$$;

-- Execution is granted to authenticated, but the function itself takes the
-- device id and reads the tenant and user from the JWT, so there is nothing to
-- pass that would widen the result. PUBLIC execute is revoked for the same reason
-- as every other function in migration 0013: a default grant is a public API
-- surface.
revoke all on function app.bundle_for_device(uuid) from public;
grant execute on function app.bundle_for_device(uuid) to authenticated;
