-- Phase 2 (1/5): normalized permission model. Replaces user_profiles.role.

create table public.roles (
  key text primary key,
  name text not null,
  description text
);

create table public.permissions (
  key text primary key,
  description text,
  delegatable boolean not null default false
);

create type public.permission_scope as enum ('global', 'own_projects', 'member_projects');

create table public.role_permissions (
  role_key text not null references public.roles (key) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  scope public.permission_scope not null default 'global',
  primary key (role_key, permission_key, scope)
);

create table public.user_roles (
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  role_key text not null references public.roles (key),
  granted_by uuid references public.user_profiles (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role_key)
);

-- Explicit manual/temporary per-project grants (admin UI, viewer access).
-- NOTE: no FK to projects yet (created in migration 0003, which adds it).
create table public.user_project_permissions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  project_id uuid not null,
  permission_key text not null references public.permissions (key),
  granted_by uuid references public.user_profiles (id),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (user_id, project_id, permission_key)
);
create index upp_user_perm_idx on public.user_project_permissions (user_id, permission_key);

-- ---------- catalog ----------

insert into public.roles (key, name) values
  ('admin','Admin'), ('project_manager','Project Manager'), ('finance','Finance'),
  ('member','Member'), ('viewer','Viewer');

insert into public.permissions (key, description, delegatable) values
  ('view_project','See a project and its parts', true),
  ('edit_project','Edit project fields and parts', true),
  ('create_project','Create new projects', false),
  ('edit_status','Post project status updates', true),
  ('view_team','See project members and assignments', true),
  ('manage_project_members','Add/remove project members', false),
  ('view_links','See project links', true),
  ('manage_links','Manage project links', true),
  ('view_budget','See client-facing budget figures', false),
  ('manage_budget','Edit budgets and billing', false),
  ('view_internal_cost','See internal costs, rates, margins', false),
  ('view_clients','See clients', false),
  ('manage_clients','Manage clients', false),
  ('view_people','See the people directory and workload', false),
  ('manage_people','Manage people, skills, time off', false),
  ('log_time','Log own time entries', false),
  ('view_time','See time entries across a project', false),
  ('view_credentials','See credential metadata', true),
  ('reveal_credential','Decrypt credential secrets', false),
  ('manage_credentials','Create/edit credentials', false),
  ('manage_delegations','Create delegations for own projects', false),
  ('manage_access','Grant per-project permissions', false),
  ('manage_users','Approve users, assign roles', false),
  ('view_audit','Read the audit log', false),
  ('export_data','Export data (v2)', false);

insert into public.role_permissions (role_key, permission_key, scope) values
  -- project_manager: portfolio visibility, full control of OWN projects, no internal costs
  ('project_manager','view_project','global'),
  ('project_manager','view_team','global'),
  ('project_manager','view_people','global'),
  ('project_manager','view_clients','global'),
  ('project_manager','manage_clients','global'),
  ('project_manager','create_project','global'),
  ('project_manager','log_time','global'),
  ('project_manager','edit_project','own_projects'),
  ('project_manager','edit_status','own_projects'),
  ('project_manager','manage_project_members','own_projects'),
  ('project_manager','view_links','global'),
  ('project_manager','manage_links','own_projects'),
  ('project_manager','view_budget','own_projects'),
  ('project_manager','manage_budget','own_projects'),
  ('project_manager','view_time','own_projects'),
  ('project_manager','view_credentials','own_projects'),
  ('project_manager','reveal_credential','own_projects'),
  ('project_manager','manage_credentials','own_projects'),
  ('project_manager','manage_delegations','own_projects'),
  -- finance: all financial data everywhere, read-oriented
  ('finance','view_project','global'),
  ('finance','view_team','global'),
  ('finance','view_people','global'),
  ('finance','view_clients','global'),
  ('finance','view_budget','global'),
  ('finance','manage_budget','global'),
  ('finance','view_internal_cost','global'),
  ('finance','view_time','global'),
  ('finance','view_links','global'),
  -- member: their projects only, own time
  ('member','view_project','member_projects'),
  ('member','view_team','member_projects'),
  ('member','view_links','member_projects'),
  ('member','view_people','global'),
  ('member','log_time','global');
  -- viewer: gets everything via user_project_permissions grants; no role grants
  -- admin: no rows needed — is_admin() bypass in has_permission()

-- ---------- migrate existing data off user_profiles.role ----------

insert into public.user_roles (user_id, role_key)
select id, role::text from public.user_profiles where role is not null
on conflict do nothing;

-- is_admin() now reads user_roles (same signature; all Phase-1 policies keep working)
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    join public.user_profiles p on p.id = ur.user_id
    where ur.user_id = uid and ur.role_key = 'admin' and p.status = 'active'
  );
$$;

-- notify_admins_pending_user: was reading user_profiles.role directly (brief
-- omitted this; without the fix the on_profile_created_notify_admins trigger
-- breaks on every new signup once the role column is dropped below).
create or replace function public.notify_admins_pending_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status = 'pending' then
    insert into public.notifications (user_id, type, title, body, metadata)
    select p.id, 'user_pending', 'New user awaiting approval',
           coalesce(new.full_name, new.email) || ' signed up and needs approval.',
           jsonb_build_object('pending_user_id', new.id)
    from public.user_profiles p
    join public.user_roles ur on ur.user_id = p.id and ur.role_key = 'admin'
    where p.status = 'active';
  end if;
  return new;
end;
$$;

-- protect_profile_columns: drop role references (column is going away)
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.status is distinct from old.status
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.email is distinct from old.email
       or new.created_at is distinct from old.created_at then
      raise exception 'not allowed to change protected profile fields';
    end if;
  end if;
  return new;
end;
$$;

alter table public.user_profiles drop column role;
drop type public.app_role;

-- ---------- has_permission v1 (extended with project-scope rules in migration 0003) ----------

create or replace function public.has_permission(uid uuid, perm text, project uuid default null)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    public.is_admin(uid)
    or exists (
      select 1 from public.user_roles ur
      join public.role_permissions rp on rp.role_key = ur.role_key
      where ur.user_id = uid and rp.permission_key = perm and rp.scope = 'global')
    or exists (
      select 1 from public.user_project_permissions upp
      where upp.user_id = uid and upp.permission_key = perm
        and (upp.expires_at is null or upp.expires_at > now())
        and (project is null or upp.project_id = project))
$$;

revoke all on function public.has_permission(uuid, text, uuid) from public, anon;
grant execute on function public.has_permission(uuid, text, uuid) to authenticated;

-- ---------- RLS + grants ----------

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_project_permissions enable row level security;

-- catalog tables: readable by all authenticated (needed to render UI labels)
create policy "read roles" on public.roles for select using (auth.uid() is not null);
create policy "read permissions" on public.permissions for select using (auth.uid() is not null);
create policy "read role_permissions" on public.role_permissions for select using (auth.uid() is not null);
-- catalog writes: nobody client-side (migrations/service only) — no insert/update/delete policies

create policy "read own user_roles" on public.user_roles for select using (user_id = auth.uid());
create policy "admins read all user_roles" on public.user_roles for select using (public.is_admin());
create policy "admins manage user_roles" on public.user_roles for insert with check (public.is_admin());
create policy "admins update user_roles" on public.user_roles for update using (public.is_admin());
create policy "admins delete user_roles" on public.user_roles for delete using (public.is_admin());

create policy "read own project grants" on public.user_project_permissions for select using (user_id = auth.uid());
create policy "managers read project grants" on public.user_project_permissions for select using (public.has_permission(auth.uid(),'manage_access', project_id));
create policy "managers insert project grants" on public.user_project_permissions for insert with check (public.has_permission(auth.uid(),'manage_access', project_id));
create policy "managers delete project grants" on public.user_project_permissions for delete using (public.has_permission(auth.uid(),'manage_access', project_id));

-- explicit grants (auto_expose_new_tables is off locally)
grant select on public.roles, public.permissions, public.role_permissions to authenticated;
grant select, insert, update, delete on public.user_roles, public.user_project_permissions to authenticated;
grant select, insert, update, delete on public.roles, public.permissions, public.role_permissions, public.user_roles, public.user_project_permissions to service_role;
