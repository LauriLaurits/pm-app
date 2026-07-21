-- P1 client feedback: role titles + teams become admin-managed lists (Settings -> Lists).
-- The person form's free-text Role title / Department inputs turn into selects fed from this
-- table. kind='team' feeds the field labeled "Team" in the UI -- the people.department column
-- itself is unchanged.

create table public.managed_options (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('role_title','team')),
  value text not null,
  sort int not null default 0,
  unique (kind, value)
);

alter table public.managed_options enable row level security;

-- Readable by every signed-in user (needed to render the form selects); writes are admin-only.
-- Mirrors the catalog pattern from 20260715000002: broad select policy, is_admin() gate on all
-- writes (same as the "admins manage user_roles" policies), grants as wide as the policies.
create policy "read managed_options" on public.managed_options
  for select using (auth.uid() is not null);
create policy "admins manage managed_options" on public.managed_options
  for all using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.managed_options to authenticated;
grant select, insert, update, delete on public.managed_options to service_role;

-- Seed from whatever role titles / departments already exist in people. On a live DB this
-- captures the real values; locally `people` is still empty at migration time (demo people
-- arrive via seed.sql, which re-runs this same backfill afterwards).
insert into public.managed_options (kind, value)
select distinct 'role_title', role_title from public.people where role_title is not null
union
select distinct 'team', department from public.people where department is not null
on conflict (kind, value) do nothing;
