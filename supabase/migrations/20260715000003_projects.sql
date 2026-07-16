-- Phase 2 (2/5): clients, projects, members, parts, status updates, links.

create type public.project_status  as enum ('planning','active','on_hold','completed','archived');
create type public.project_health  as enum ('healthy','warning','critical');
create type public.project_priority as enum ('low','medium','high');
create type public.budget_type     as enum ('fixed','hourly','mixed');
create type public.part_status     as enum ('not_started','in_progress','blocked','done');
create type public.billing_model   as enum ('fixed','hourly');
create type public.link_type       as enum ('repo','issue_tracker','design','docs','env_prod','env_prelive','env_staging','env_dev','api_docs','monitoring','hosting','db_dashboard','custom');
create type public.link_visibility as enum ('project','pm_only','admins_only');

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  contact_email text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_id uuid references public.clients (id),
  description text,
  pm_id uuid references public.user_profiles (id),
  owner_id uuid references public.user_profiles (id),
  status public.project_status not null default 'planning',
  health public.project_health not null default 'healthy',
  priority public.project_priority not null default 'medium',
  start_date date,
  deadline date,
  progress int not null default 0 check (progress between 0 and 100),
  budget_type public.budget_type not null,
  risks text,
  blockers text,
  next_steps text,
  internal_notes text,
  client_notes text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_pm_idx on public.projects (pm_id);
create index projects_status_idx on public.projects (status);

create table public.project_members (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  role_on_project text,
  starts_on date,
  ends_on date,
  unique (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

create table public.project_parts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  description text,
  status public.part_status not null default 'not_started',
  responsible_person_id uuid,           -- FK to people added in migration 0004
  billing_model public.billing_model not null,
  estimated_hours numeric(8,2),
  progress int not null default 0 check (progress between 0 and 100),
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_parts_project_idx on public.project_parts (project_id);

create table public.part_dependencies (
  part_id uuid not null references public.project_parts (id) on delete cascade,
  depends_on_part_id uuid not null references public.project_parts (id) on delete cascade,
  primary key (part_id, depends_on_part_id),
  check (part_id <> depends_on_part_id)
);

-- dependencies are project-internal: an edge may never cross projects
create or replace function public.enforce_same_project_dependency()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select project_id from public.project_parts where id = new.part_id)
     is distinct from
     (select project_id from public.project_parts where id = new.depends_on_part_id) then
    raise exception 'part dependencies must stay within one project';
  end if;
  return new;
end;
$$;
create trigger part_dependencies_same_project
  before insert or update on public.part_dependencies
  for each row execute function public.enforce_same_project_dependency();

create table public.project_status_updates (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid not null references public.user_profiles (id),
  completed text,
  in_progress text,
  blockers text,
  decisions_needed text,
  next_milestone text,
  handover_info text,
  created_at timestamptz not null default now()
);
create index psu_project_idx on public.project_status_updates (project_id, created_at desc);

create table public.project_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  url text not null,
  type public.link_type not null default 'custom',
  environment text,
  description text,
  owner_id uuid references public.user_profiles (id),
  visibility public.link_visibility not null default 'project',
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_links_project_idx on public.project_links (project_id);

-- updated_at triggers (reuses Phase-1 set_updated_at)
create trigger clients_updated_at before update on public.clients for each row execute function public.set_updated_at();
create trigger projects_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger project_parts_updated_at before update on public.project_parts for each row execute function public.set_updated_at();
create trigger project_links_updated_at before update on public.project_links for each row execute function public.set_updated_at();

-- non-admins may never change a project's pm_id (would transfer own_projects powers without consent)
create or replace function public.protect_project_pm()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.pm_id is distinct from old.pm_id and not public.is_admin() then
    raise exception 'only an admin can reassign a project''s PM';
  end if;
  return new;
end;
$$;
create trigger projects_protect_pm before update on public.projects
  for each row execute function public.protect_project_pm();

-- user_project_permissions now gets its FK
alter table public.user_project_permissions
  add constraint upp_project_fk foreign key (project_id) references public.projects (id) on delete cascade;

-- ---------- has_permission v2: adds own_projects / member_projects scopes ----------
-- NOTE (review finding): every non-admin branch is gated on the profile being ACTIVE —
-- a disabled user's still-valid JWT must not pass RLS through role/explicit grants.

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
      )
    )
$$;

-- ---------- RLS ----------

alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_parts enable row level security;
alter table public.part_dependencies enable row level security;
alter table public.project_status_updates enable row level security;
alter table public.project_links enable row level security;

create policy "view clients" on public.clients for select using (public.has_permission(auth.uid(),'view_clients'));
create policy "manage clients" on public.clients for all using (public.has_permission(auth.uid(),'manage_clients')) with check (public.has_permission(auth.uid(),'manage_clients'));

create policy "view project" on public.projects for select using (public.has_permission(auth.uid(),'view_project', id));
create policy "create project" on public.projects for insert with check (
  public.has_permission(auth.uid(),'create_project')
  and (pm_id = auth.uid() or public.is_admin()));
create policy "edit project" on public.projects for update using (public.has_permission(auth.uid(),'edit_project', id));
create policy "admin delete project" on public.projects for delete using (public.is_admin());

create policy "view team" on public.project_members for select using (public.has_permission(auth.uid(),'view_team', project_id));
create policy "manage team" on public.project_members for all using (public.has_permission(auth.uid(),'manage_project_members', project_id)) with check (public.has_permission(auth.uid(),'manage_project_members', project_id));

create policy "view parts" on public.project_parts for select using (public.has_permission(auth.uid(),'view_project', project_id));
create policy "edit parts" on public.project_parts for all using (public.has_permission(auth.uid(),'edit_project', project_id)) with check (public.has_permission(auth.uid(),'edit_project', project_id));

create policy "view part deps" on public.part_dependencies for select using (exists (select 1 from public.project_parts pp where pp.id = part_id and public.has_permission(auth.uid(),'view_project', pp.project_id)));
create policy "edit part deps" on public.part_dependencies for all using (exists (select 1 from public.project_parts pp where pp.id = part_id and public.has_permission(auth.uid(),'edit_project', pp.project_id))) with check (exists (select 1 from public.project_parts pp where pp.id = part_id and public.has_permission(auth.uid(),'edit_project', pp.project_id)));

-- status updates: readable with the project, insertable with edit_status, IMMUTABLE (no update policy), admin-only delete
create policy "view status updates" on public.project_status_updates for select using (public.has_permission(auth.uid(),'view_project', project_id));
create policy "post status update" on public.project_status_updates for insert with check (public.has_permission(auth.uid(),'edit_status', project_id) and author_id = auth.uid());
create policy "admin delete status update" on public.project_status_updates for delete using (public.is_admin());

create policy "view links" on public.project_links for select using (
  public.has_permission(auth.uid(),'view_links', project_id)
  and (visibility = 'project'
       or (visibility = 'pm_only' and public.has_permission(auth.uid(),'edit_project', project_id))
       or public.is_admin()));
-- Write policies are split off SELECT (a FOR ALL policy would OR into SELECT and let a
-- non-admin manage_links holder read/write admins_only links, bypassing the tier in
-- "view links" above). Each write also carries the admins_only gate so only admins
-- manage admins_only links. Mirrors the credentials policy split.
create policy "insert links" on public.project_links for insert
  with check (public.has_permission(auth.uid(),'manage_links', project_id)
              and (visibility <> 'admins_only' or public.is_admin()));
create policy "update links" on public.project_links for update
  using (public.has_permission(auth.uid(),'manage_links', project_id)
         and (visibility <> 'admins_only' or public.is_admin()))
  with check (public.has_permission(auth.uid(),'manage_links', project_id)
              and (visibility <> 'admins_only' or public.is_admin()));
create policy "delete links" on public.project_links for delete
  using (public.has_permission(auth.uid(),'manage_links', project_id)
         and (visibility <> 'admins_only' or public.is_admin()));

-- ---------- grants ----------
grant select, insert, update, delete on public.clients, public.projects, public.project_members, public.project_parts, public.part_dependencies, public.project_links to authenticated;
grant select, insert, delete on public.project_status_updates to authenticated;  -- no UPDATE: immutability at privilege level too
grant select, insert, update, delete on public.clients, public.projects, public.project_members, public.project_parts, public.part_dependencies, public.project_status_updates, public.project_links to service_role;
