-- Phase 1: profiles + approval state, audit log, notifications, session management

create type public.user_status as enum ('pending', 'active', 'disabled');
create type public.app_role as enum ('admin', 'project_manager', 'finance', 'member', 'viewer');

create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  status public.user_status not null default 'pending',
  role public.app_role,
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_email text,
  action text not null,
  resource_type text,
  resource_id text,
  ip text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_action_idx on public.audit_logs (action, created_at desc);

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.user_profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------- helpers ----------

create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_profiles
    where id = uid and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- ---------- new-user trigger: auth.users -> pending profile ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- notify active admins about a new pending user ----------

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
    where p.role = 'admin' and p.status = 'active';
  end if;
  return new;
end;
$$;

create trigger on_profile_created_notify_admins
  after insert on public.user_profiles
  for each row execute function public.notify_admins_pending_user();

-- ---------- protect approval columns from non-admins ----------

create or replace function public.protect_profile_columns()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  -- service role has auth.uid() = null and bypasses this guard
  if auth.uid() is not null and not public.is_admin() then
    if new.status is distinct from old.status
       or new.role is distinct from old.role
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at then
      raise exception 'not allowed to change protected profile fields';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_profile_columns
  before update on public.user_profiles
  for each row execute function public.protect_profile_columns();

-- ---------- RLS ----------

alter table public.user_profiles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;

-- Local/self-hosted Supabase does not auto-expose newly created tables to the
-- Data API roles (auto_expose_new_tables is off by default) -- this applies to
-- anon/authenticated/service_role alike. RLS policies only ever narrow rows on
-- top of a table-level grant, so the baseline privileges below are required
-- for the policies below to be reachable at all; they do not themselves grant
-- anything beyond what each table's RLS policies allow for anon/authenticated.
-- service_role has BYPASSRLS and is trusted server-side code (this migration,
-- the seed script, and later server actions), so it is granted broad CRUD,
-- except where a table is intentionally append-only (see audit_logs below).
grant select, update on public.user_profiles to authenticated;
grant select on public.audit_logs to authenticated;
-- notifications: clients may only flip the read_at receipt column -- title/body/
-- type/metadata must stay server-controlled, so the grant is column-scoped
-- rather than table-wide (the RLS policy below narrows rows, not columns).
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.user_profiles to service_role;
-- audit_logs is append-only even for trusted server-side code: no update/delete.
grant select, insert on public.audit_logs to service_role;
grant select, insert, update, delete on public.notifications to service_role;

create policy "read own profile" on public.user_profiles
  for select using (id = auth.uid());
create policy "admins read all profiles" on public.user_profiles
  for select using (public.is_admin());
create policy "update own profile" on public.user_profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy "admins update any profile" on public.user_profiles
  for update using (public.is_admin());

-- audit_logs: admins may read; nobody (client-side) may write/update/delete.
-- Writes happen only via the service role, which bypasses RLS.
create policy "admins read audit logs" on public.audit_logs
  for select using (public.is_admin());
revoke insert, update, delete on public.audit_logs from authenticated, anon;

create policy "read own notifications" on public.notifications
  for select using (user_id = auth.uid());
create policy "mark own notifications read" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, delete on public.notifications from authenticated, anon;

-- ---------- session management over auth.sessions ----------

create or replace function public.list_my_sessions()
returns table (id uuid, created_at timestamptz, updated_at timestamptz, user_agent text, ip text)
language sql security definer
set search_path = ''
as $$
  select s.id, s.created_at, s.updated_at, s.user_agent, host(s.ip) as ip
  from auth.sessions s
  where s.user_id = auth.uid()
  order by s.updated_at desc;
$$;

create or replace function public.revoke_session(session_id uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  deleted_count int;
begin
  delete from auth.sessions
  where id = session_id and user_id = auth.uid();
  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

create or replace function public.admin_revoke_user_sessions(target_user uuid)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  deleted_count int;
begin
  if not public.is_admin() then
    raise exception 'admin permission required';
  end if;
  delete from auth.sessions where user_id = target_user;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.list_my_sessions() from public, anon;
revoke all on function public.revoke_session(uuid) from public, anon;
revoke all on function public.admin_revoke_user_sessions(uuid) from public, anon;
grant execute on function public.list_my_sessions() to authenticated;
grant execute on function public.revoke_session(uuid) to authenticated;
grant execute on function public.admin_revoke_user_sessions(uuid) to authenticated;
