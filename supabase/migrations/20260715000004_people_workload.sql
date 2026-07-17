-- Phase 2 (3/5): people directory, skills, time off, assignments, time entries, rates.

create type public.employment_type as enum ('employee','contractor','freelance');
create type public.person_status   as enum ('active','inactive');
create type public.time_off_type   as enum ('vacation','sick','other');
create type public.rate_type       as enum ('internal_cost','billing');

create table public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.user_profiles (id) on delete set null,
  full_name text not null,
  email text,
  avatar_url text,
  role_title text,
  department text,
  employment_type public.employment_type not null default 'employee',
  weekly_capacity_hours numeric(5,2) not null default 40,
  status public.person_status not null default 'active',
  contacts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text
);

create table public.person_skills (
  person_id uuid not null references public.people (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  level int not null default 3 check (level between 1 and 5),
  primary key (person_id, skill_id)
);

create table public.time_off (
  id bigint generated always as identity primary key,
  person_id uuid not null references public.people (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  type public.time_off_type not null default 'vacation',
  note text,
  check (ends_on >= starts_on)
);
create index time_off_person_idx on public.time_off (person_id, starts_on);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  project_part_id uuid references public.project_parts (id) on delete set null,
  person_id uuid not null references public.people (id) on delete cascade,
  role_on_project text,
  allocation_pct numeric(5,2) not null check (allocation_pct > 0 and allocation_pct <= 200),
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assignments_person_idx on public.assignments (person_id, start_date);
create index assignments_project_idx on public.assignments (project_id);

create table public.time_entries (
  id bigint generated always as identity primary key,
  person_id uuid not null references public.people (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  project_part_id uuid references public.project_parts (id) on delete set null,
  entry_date date not null,
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  billable boolean not null default true,
  description text,
  created_at timestamptz not null default now()
);
create index time_entries_person_idx on public.time_entries (person_id, entry_date);
create index time_entries_project_idx on public.time_entries (project_id, entry_date);

create table public.rates (
  id bigint generated always as identity primary key,
  person_id uuid not null references public.people (id) on delete cascade,
  rate_type public.rate_type not null,
  amount numeric(10,2) not null check (amount >= 0),
  currency char(3) not null default 'EUR',
  valid_from date not null,
  valid_to date,
  check (valid_to is null or valid_to >= valid_from)
);
create index rates_person_idx on public.rates (person_id, rate_type, valid_from desc);

alter table public.project_parts
  add constraint parts_responsible_fk foreign key (responsible_person_id) references public.people (id) on delete set null;

create trigger people_updated_at before update on public.people for each row execute function public.set_updated_at();
create trigger assignments_updated_at before update on public.assignments for each row execute function public.set_updated_at();

-- helper: the person row belonging to the current user (for own-time policies)
create or replace function public.current_person_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.people where user_id = auth.uid()
$$;
revoke all on function public.current_person_id() from public, anon;
grant execute on function public.current_person_id() to authenticated;

-- ---------- RLS ----------

alter table public.people enable row level security;
alter table public.skills enable row level security;
alter table public.person_skills enable row level security;
alter table public.time_off enable row level security;
alter table public.assignments enable row level security;
alter table public.time_entries enable row level security;
alter table public.rates enable row level security;

create policy "view people" on public.people for select using (public.has_permission(auth.uid(),'view_people'));
create policy "manage people" on public.people for all using (public.has_permission(auth.uid(),'manage_people')) with check (public.has_permission(auth.uid(),'manage_people'));

create policy "view skills" on public.skills for select using (public.has_permission(auth.uid(),'view_people'));
create policy "manage skills" on public.skills for all using (public.has_permission(auth.uid(),'manage_people')) with check (public.has_permission(auth.uid(),'manage_people'));
create policy "view person_skills" on public.person_skills for select using (public.has_permission(auth.uid(),'view_people'));
create policy "manage person_skills" on public.person_skills for all using (public.has_permission(auth.uid(),'manage_people')) with check (public.has_permission(auth.uid(),'manage_people'));

create policy "view time_off" on public.time_off for select using (
  (public.has_permission(auth.uid(),'view_people') and type = 'vacation')
  or exists (select 1 from public.people p where p.id = person_id and p.user_id = auth.uid())
  or public.has_permission(auth.uid(),'manage_people')
  or public.is_admin());
create policy "manage time_off" on public.time_off for all using (public.has_permission(auth.uid(),'manage_people')) with check (public.has_permission(auth.uid(),'manage_people'));

create policy "view assignments" on public.assignments for select using (
  public.has_permission(auth.uid(),'view_team', project_id) or person_id = public.current_person_id());
create policy "manage assignments" on public.assignments for all using (public.has_permission(auth.uid(),'manage_project_members', project_id)) with check (public.has_permission(auth.uid(),'manage_project_members', project_id));

-- time entries: own rows always; project-wide with view_time; insert only as yourself with log_time
create policy "read own time" on public.time_entries for select using (person_id = public.current_person_id());
create policy "read project time" on public.time_entries for select using (public.has_permission(auth.uid(),'view_time', project_id));
-- you can log time on a project you're a MEMBER of or ASSIGNED to
create policy "log own time" on public.time_entries for insert with check (
  public.has_permission(auth.uid(),'log_time')
  and person_id = public.current_person_id()
  and (
    exists (select 1 from public.project_members pm
            where pm.user_id = auth.uid() and pm.project_id = time_entries.project_id)
    or exists (select 1 from public.assignments a
               where a.person_id = time_entries.person_id and a.project_id = time_entries.project_id)
  ));
create policy "edit own time" on public.time_entries for update using (person_id = public.current_person_id()) with check (person_id = public.current_person_id());
create policy "delete own time" on public.time_entries for delete using (person_id = public.current_person_id());

-- rates: FINANCE ONLY (spec: internal cost + billing rate need finance permission)
create policy "finance reads rates" on public.rates for select using (public.has_permission(auth.uid(),'view_internal_cost'));
create policy "finance manages rates" on public.rates for all using (public.has_permission(auth.uid(),'view_internal_cost') and public.has_permission(auth.uid(),'manage_budget')) with check (public.has_permission(auth.uid(),'view_internal_cost') and public.has_permission(auth.uid(),'manage_budget'));

-- ---------- grants ----------
grant select, insert, update, delete on public.people, public.skills, public.person_skills, public.time_off, public.assignments, public.time_entries, public.rates to authenticated;
grant select, insert, update, delete on public.people, public.skills, public.person_skills, public.time_off, public.assignments, public.time_entries, public.rates to service_role;
