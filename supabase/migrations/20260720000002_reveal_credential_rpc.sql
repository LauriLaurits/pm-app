-- Phase 6, Task 1: audited credential reveal. Mirrors the write-side pattern from
-- 20260716000001_credential_secret_rpc.sql (a SECURITY DEFINER wrapper is the only way to reach
-- the `vault` schema, since it's not in api.schemas and carries no grants for
-- anon/authenticated) but adds the read-side permission gate that write path didn't need:
-- reveal_credential_secret is reachable by any authenticated user via RPC, so it must
-- self-check has_permission(auth.uid(),'reveal_credential', <credential's project>) before ever
-- touching vault.decrypted_secrets -- the RLS on public.credentials only gates SELECT on the
-- metadata row (view_credentials, a much wider grant), never on the plaintext, so that policy
-- cannot be relied on here.
--
-- `set search_path = ''` (rather than `= public, vault` like the create-side wrapper) so every
-- identifier below must be schema-qualified -- the stricter of the two is used here specifically
-- because this function's whole job is deciding whether to hand back a secret, so there's no
-- room for a search-path-hijacked object to swap in silently.
--
-- The permission gate is TWO conditions, ANDed, mirroring "view credential metadata" on
-- public.credentials (20260715000006_credentials_delegations.sql) exactly: reveal must never
-- exceed what the metadata SELECT policy would already let this caller see. has_permission alone
-- only proves the caller holds reveal_credential on the credential's project -- it says nothing
-- about the credential's own `visibility` tier, so an admins_only credential the caller cannot
-- even list would otherwise still be revealable. The second condition (visibility gate) closes
-- that: not admins_only, or admin, or the credential's owner, or an explicit credential_access
-- grantee.
--
-- Returns (secret, project_id) rather than bare text so the caller (revealCredentialAction) can
-- audit the credential's REAL project -- derived here, server-side, from the credential row --
-- instead of trusting whatever project_id the client happened to pass in.
create or replace function public.reveal_credential_secret(cred_id uuid)
returns table (secret text, project_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_secret_id uuid;
  v_visibility public.credential_visibility;
  v_owner_id uuid;
begin
  select c.project_id, c.secret_id, c.visibility, c.owner_id
    into v_project_id, v_secret_id, v_visibility, v_owner_id
  from public.credentials c
  where c.id = cred_id;

  -- Unknown credential id and "not permitted" get the identical error message/path below --
  -- never let a caller distinguish "doesn't exist" from "exists but you can't reveal it".
  if v_project_id is null then
    raise exception 'not permitted';
  end if;

  -- v_owner_id = auth.uid() is written null-safe (v_owner_id is not null and ...) because
  -- owner_id is nullable on public.credentials: with a bare `=`, an unowned (null owner_id)
  -- credential makes that comparison evaluate to NULL rather than false, which would poison the
  -- whole OR chain to NULL and make the surrounding `if not (...)` silently skip the exception
  -- (plpgsql treats a NULL condition as false, i.e. "don't raise") -- exactly backwards from the
  -- intended fail-closed behavior.
  if not (
    public.has_permission(auth.uid(), 'reveal_credential', v_project_id)
    and (
      v_visibility <> 'admins_only'
      or public.is_admin()
      or (v_owner_id is not null and v_owner_id = auth.uid())
      or public.has_credential_access(cred_id, auth.uid())
    )
  ) then
    raise exception 'not permitted';
  end if;

  -- The only read of vault.decrypted_secrets in the whole app. Returns exactly the plaintext
  -- string (plus the server-derived project_id for auditing) and nothing else -- no logging, no
  -- wrapping, no side channel.
  return query
    select vds.decrypted_secret, v_project_id
    from vault.decrypted_secrets vds
    where vds.id = v_secret_id;
end;
$$;

-- anon must never be able to even attempt this (defense in depth beyond the in-body check);
-- authenticated gets exec but every call is still gated by the has_permission/visibility check
-- above.
revoke all on function public.reveal_credential_secret(uuid) from public, anon;
grant execute on function public.reveal_credential_secret(uuid) to authenticated;
