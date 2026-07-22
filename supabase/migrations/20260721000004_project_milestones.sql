-- P4 client feedback: milestones ("verstapostid"). A project's timeline becomes a list of
-- dated milestones; one may be marked kind='start' and one kind='end', and THOSE feed the
-- projects.start_date/deadline columns (kept synced by trigger below) so every existing
-- consumer -- deriveHealth, deadline countdowns, list views -- keeps reading the same columns.

create table public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  due_on date not null,
  kind text not null default 'milestone' check (kind in ('start','end','milestone')),
  done boolean not null default false,
  sort int not null default 0,
  created_at timestamptz default now()
);
create index project_milestones_project_idx on public.project_milestones (project_id);

-- At most ONE start and ONE end milestone per project -- they map 1:1 onto the single
-- start_date/deadline columns, so a second one would be ambiguous. Partial unique indexes
-- (plain 'milestone' rows stay unlimited); the forms also refuse duplicates client-side,
-- but these are the backstop.
create unique index project_milestones_one_start on public.project_milestones (project_id) where kind = 'start';
create unique index project_milestones_one_end on public.project_milestones (project_id) where kind = 'end';

alter table public.project_milestones enable row level security;

-- Same visibility/write gates as project_parts (20260715000003): anyone who may view the
-- project may see its milestones; writes need edit_project on the project.
create policy "view milestones" on public.project_milestones
  for select using (public.has_permission(auth.uid(),'view_project', project_id));
create policy "edit milestones" on public.project_milestones
  for all using (public.has_permission(auth.uid(),'edit_project', project_id))
  with check (public.has_permission(auth.uid(),'edit_project', project_id));

-- Auto-expose is off -- explicit grants, as wide as the policies (same convention as every
-- other migration here).
grant select, insert, update, delete on public.project_milestones to authenticated;
grant select, insert, update, delete on public.project_milestones to service_role;

-- ---------- keep projects.start_date/deadline synced from start/end milestones ----------
-- DB-level (not action-level) so the derivation can't be skipped by any write path. Security
-- definer: the caller already proved edit_project via the milestone RLS above, and the synced
-- column update must not additionally depend on the projects UPDATE policy evaluating mid-
-- trigger. DELETE deliberately does NOT clear the project dates -- removing a start/end
-- milestone leaves the last-known dates in place rather than blanking the timeline.
create or replace function public.sync_project_dates_from_milestone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'start' then
    update public.projects set start_date = new.due_on
    where id = new.project_id and start_date is distinct from new.due_on;
  elsif new.kind = 'end' then
    update public.projects set deadline = new.due_on
    where id = new.project_id and deadline is distinct from new.due_on;
  end if;
  return new;
end;
$$;
create trigger project_milestones_sync_dates
  after insert or update on public.project_milestones
  for each row execute function public.sync_project_dates_from_milestone();
