-- Phase 3b: credentials UI needs a way for the app's service-role client to create a Vault
-- secret. The `vault` schema is deliberately NOT in api.schemas (see supabase/config.toml --
-- only "public" and "graphql_public" are exposed), so even the service-role key cannot call
-- vault.create_secret directly over PostgREST/RPC: PostgREST rejects any schema it wasn't
-- told to expose, regardless of the calling Postgres role's grants. The fix (the standard
-- Supabase pattern for this) is a thin SECURITY DEFINER wrapper living in `public` --
-- reachable via the normal RPC path -- that pushes the actual vault.create_secret call into
-- the vault schema on the caller's behalf. It carries no privilege of its own for anon/
-- authenticated (both are revoked below), so the "only the service role can touch vault"
-- rule from the Phase 2 migration is preserved: this just makes that already-service-role-only
-- capability reachable through supabase-js instead of requiring a raw SQL connection.
create or replace function public.create_credential_secret(
  secret text,
  secret_name text,
  secret_description text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  new_id uuid;
begin
  new_id := vault.create_secret(secret, secret_name, secret_description);
  return new_id;
end;
$$;

revoke all on function public.create_credential_secret(text, text, text) from public, anon, authenticated;
grant execute on function public.create_credential_secret(text, text, text) to service_role;
