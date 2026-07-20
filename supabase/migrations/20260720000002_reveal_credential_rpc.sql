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
create or replace function public.reveal_credential_secret(cred_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_secret_id uuid;
begin
  select c.project_id, c.secret_id into v_project_id, v_secret_id
  from public.credentials c
  where c.id = cred_id;

  -- Unknown credential id and "not permitted" get the identical error message/path below --
  -- never let a caller distinguish "doesn't exist" from "exists but you can't reveal it".
  if v_project_id is null then
    raise exception 'not permitted';
  end if;

  if not public.has_permission(auth.uid(), 'reveal_credential', v_project_id) then
    raise exception 'not permitted';
  end if;

  -- The only read of vault.decrypted_secrets in the whole app. Returns exactly the plaintext
  -- string and nothing else -- no logging, no wrapping, no side channel.
  return (select decrypted_secret from vault.decrypted_secrets where id = v_secret_id);
end;
$$;

-- anon must never be able to even attempt this (defense in depth beyond the in-body check);
-- authenticated gets exec but every call is still gated by the has_permission check above.
revoke all on function public.reveal_credential_secret(uuid) from public, anon;
grant execute on function public.reveal_credential_secret(uuid) to authenticated;
