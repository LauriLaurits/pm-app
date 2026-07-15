-- Phase 2 (5/5): credentials (Vault-backed) + delegations.

create extension if not exists supabase_vault;

create type public.credential_type as enum ('server_login','db_login','api_key','hosting','admin_panel','third_party','ssh','client_provided');
create type public.credential_environment as enum ('prod','prelive','staging','dev','other');
create type public.credential_visibility as enum ('project_members','pms_only','admins_only');

-- Secrets NEVER live in this table: secret_id references vault.secrets, and the
-- vault schema is not exposed through the API, so no RLS read-path to raw values exists.
create table public.credentials (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  type public.credential_type not null,
  username text,
  secret_id uuid not null,
  related_url text,
  environment public.credential_environment not null default 'other',
  notes text,
  owner_id uuid references public.user_profiles (id),
  expires_at timestamptz,
  last_rotated_at timestamptz,
  visibility public.credential_visibility not null default 'project_members',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index credentials_project_idx on public.credentials (project_id);

create table public.credential_access (
  id bigint generated always as identity primary key,
  credential_id uuid not null references public.credentials (id) on delete cascade,
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  granted_by uuid references public.user_profiles (id),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (credential_id, user_id)
);

create table public.delegations (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.user_profiles (id),
  to_user uuid not null references public.user_profiles (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  handover_notes text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.user_profiles (id),
  check (ends_at > starts_at),
  check (from_user <> to_user)
);
create index delegations_to_user_idx on public.delegations (to_user, starts_at, ends_at);

create table public.delegation_permissions (
  id bigint generated always as identity primary key,
  delegation_id uuid not null references public.delegations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  permission_key text not null references public.permissions (key),
  unique (delegation_id, project_id, permission_key)
);

create trigger credentials_updated_at before update on public.credentials for each row execute function public.set_updated_at();

-- only delegatable permissions can be delegated (spec: NOT budgets, costs, user management)
create or replace function public.enforce_delegatable_permission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.permissions where key = new.permission_key and delegatable) then
    raise exception 'permission is not delegatable';
  end if;
  return new;
end;
$$;
create trigger delegation_permissions_delegatable
  before insert or update on public.delegation_permissions
  for each row execute function public.enforce_delegatable_permission();

-- delegations may only cover the delegator's own projects (or admin acting)
create or replace function public.validate_delegation_project()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  select d.from_user into owner from public.delegations d where d.id = new.delegation_id;
  if not public.is_admin() and not exists (
    select 1 from public.projects p where p.id = new.project_id and p.pm_id = owner) then
    raise exception 'can only delegate own projects';
  end if;
  return new;
end;
$$;
create trigger delegation_permissions_own_project
  before insert or update on public.delegation_permissions
  for each row execute function public.validate_delegation_project();

-- a delegation may only ever be updated to set revoked_at/revoked_by (one-way revoke); once
-- revoked it is immutable. RLS ("revoke own delegation") only gates row access, not column
-- mutation, so this is enforced structurally here.
create or replace function public.enforce_delegation_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.revoked_at is not null then
    raise exception 'a revoked delegation is immutable';
  end if;
  if new.from_user is distinct from old.from_user
     or new.to_user is distinct from old.to_user
     or new.starts_at is distinct from old.starts_at
     or new.ends_at is distinct from old.ends_at
     or new.handover_notes is distinct from old.handover_notes
     or new.created_at is distinct from old.created_at then
    raise exception 'only revoked_at/revoked_by may be updated on a delegation';
  end if;
  return new;
end;
$$;
create trigger delegations_update_guard
  before update on public.delegations
  for each row execute function public.enforce_delegation_update();

-- ---------- has_permission v3: + live delegation check ----------
-- Same ACTIVE-profile gate as v2 wraps every non-admin branch, including delegations.

create or replace function public.has_permission(uid uuid, perm text, project uuid default null)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    public.is_admin(uid)
    or (
      exists (select 1 from public.user_profiles up where up.id = uid and up.status = 'active')
      and (
        exists (
          select 1 from public.user_roles ur
          join public.role_permissions rp on rp.role_key = ur.role_key
          where ur.user_id = uid and rp.permission_key = perm and rp.scope = 'global')
        or (project is not null and exists (
          select 1 from public.user_roles ur
          join public.role_permissions rp on rp.role_key = ur.role_key
          join public.projects p on p.id = project
          where ur.user_id = uid and rp.permission_key = perm
            and rp.scope = 'own_projects' and p.pm_id = uid))
        or (project is not null and exists (
          select 1 from public.user_roles ur
          join public.role_permissions rp on rp.role_key = ur.role_key
          join public.project_members pm on pm.project_id = project and pm.user_id = uid
          where ur.user_id = uid and rp.permission_key = perm
            and rp.scope = 'member_projects'))
        or exists (
          -- a per-project grant only satisfies a project-scoped check (never an unscoped/global one)
          select 1 from public.user_project_permissions upp
          where upp.user_id = uid and upp.permission_key = perm
            and (upp.expires_at is null or upp.expires_at > now())
            and project is not null and upp.project_id = project)
        or (project is not null and exists (
          select 1 from public.delegations d
          join public.delegation_permissions dp on dp.delegation_id = d.id
          where d.to_user = uid and dp.permission_key = perm and dp.project_id = project
            and d.revoked_at is null and now() >= d.starts_at and now() < d.ends_at))
      )
    )
$$;

-- has_credential_access: encapsulates the credential_access lookup used by the
-- credentials SELECT policy. credential_access's own policies query credentials
-- back (for the manager branch); embedding that lookup as a raw correlated
-- subquery directly in the credentials policy creates a credentials <-> credential_access
-- RLS cycle ("infinite recursion detected in policy for relation"). Wrapping it in a
-- security definer function (owned by the migration role, which owns both tables and
-- therefore bypasses RLS the same way has_permission()/is_admin() already do) breaks the
-- cycle without changing the semantics: still scoped to this exact credential+user+expiry.
create or replace function public.has_credential_access(cred_id uuid, uid uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.credential_access ca
    where ca.credential_id = cred_id and ca.user_id = uid
      and (ca.expires_at is null or ca.expires_at > now())
  );
$$;

revoke all on function public.has_credential_access(uuid, uuid) from public, anon;
grant execute on function public.has_credential_access(uuid, uuid) to authenticated;

-- ---------- RLS ----------

alter table public.credentials enable row level security;
alter table public.credential_access enable row level security;
alter table public.delegations enable row level security;
alter table public.delegation_permissions enable row level security;

-- Anyone with view_credentials on the project (PM, an active delegate the PM handed
-- credential access to, or an explicit grantee) sees project_members and pms_only
-- credentials. admins_only stays admin-only (owner still sees their own).
create policy "view credential metadata" on public.credentials for select using (
  (public.has_permission(auth.uid(),'view_credentials', project_id)
   and (visibility <> 'admins_only' or public.is_admin()))
  or owner_id = auth.uid()
  or public.has_credential_access(id, auth.uid()));
-- Write policies must respect the same admins_only visibility gate as the read policy above
-- (VG), otherwise a project-scoped manager (manage_credentials own_projects) could read/write
-- admins_only credentials via UPDATE/DELETE even though SELECT would hide them. MC = holds
-- manage_credentials on the credential's project; VG = not admins_only, or is_admin().
create policy "insert credentials" on public.credentials for insert
  with check (public.has_permission(auth.uid(),'manage_credentials', project_id) and (visibility <> 'admins_only' or public.is_admin()));
create policy "update credentials" on public.credentials for update
  using (public.has_permission(auth.uid(),'manage_credentials', project_id) and (visibility <> 'admins_only' or public.is_admin()))
  with check (public.has_permission(auth.uid(),'manage_credentials', project_id) and (visibility <> 'admins_only' or public.is_admin()));
create policy "delete credentials" on public.credentials for delete
  using (public.has_permission(auth.uid(),'manage_credentials', project_id) and (visibility <> 'admins_only' or public.is_admin()));

create policy "view own credential grants" on public.credential_access for select using (user_id = auth.uid());
create policy "managers view credential grants" on public.credential_access for select using (exists (select 1 from public.credentials c where c.id = credential_id and public.has_permission(auth.uid(),'manage_credentials', c.project_id)));
-- extending access to an admins_only credential is itself gated: a manager/owner must not be
-- able to grant others into a credential they cannot even see (mirrors the write-policy VG above).
create policy "managers manage credential grants" on public.credential_access for all using (exists (select 1 from public.credentials c where c.id = credential_id and public.has_permission(auth.uid(),'manage_credentials', c.project_id) and (c.visibility <> 'admins_only' or public.is_admin()))) with check (exists (select 1 from public.credentials c where c.id = credential_id and public.has_permission(auth.uid(),'manage_credentials', c.project_id) and (c.visibility <> 'admins_only' or public.is_admin())));

create policy "view own delegations" on public.delegations for select using (from_user = auth.uid() or to_user = auth.uid() or public.is_admin());
-- manage_delegations is scoped own_projects, so this only checks the delegator holds it on
-- at least one owned project; which project(s) actually get delegated is enforced per-row
-- by the validate_delegation_project trigger on delegation_permissions.
create policy "create own delegation" on public.delegations for insert with check (
  from_user = auth.uid()
  and exists (
    select 1 from public.projects p
    where p.pm_id = auth.uid()
      and public.has_permission(auth.uid(),'manage_delegations', p.id)));
-- The policy below only gates row ACCESS (who may attempt an update); WHAT may actually change
-- on that row (only revoked_at/revoked_by, one-way, never un-revoking) is enforced structurally
-- by the delegations_update_guard trigger (enforce_delegation_update) defined above.
create policy "revoke own delegation" on public.delegations for update using (from_user = auth.uid() or public.is_admin());
create policy "admin delete delegation" on public.delegations for delete using (public.is_admin());

create policy "view delegation perms" on public.delegation_permissions for select using (exists (select 1 from public.delegations d where d.id = delegation_id and (d.from_user = auth.uid() or d.to_user = auth.uid() or public.is_admin())));
create policy "edit own delegation perms" on public.delegation_permissions for all using (exists (select 1 from public.delegations d where d.id = delegation_id and d.from_user = auth.uid())) with check (exists (select 1 from public.delegations d where d.id = delegation_id and d.from_user = auth.uid()));

-- ---------- grants ----------
grant select, insert, update, delete on public.credentials, public.credential_access, public.delegations, public.delegation_permissions to authenticated;
grant select, insert, update, delete on public.credentials, public.credential_access, public.delegations, public.delegation_permissions to service_role;
-- vault schema: NO grants to authenticated/anon — server-side (service role) only, Phase 6
