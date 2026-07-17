-- Backfill: a project's PM has never been required to also be a `project_members` row --
-- that's the "PM isn't a member of their own project" gap (People tab shows no PM, and the
-- PM can't log time since "log own time" checks `assignments`, not `project_members`).
-- createProjectAction now inserts both rows for every NEW project; this migration gives
-- every EXISTING project the same invariant, idempotently, so re-running it (or running it
-- against a database that already has these rows) is always a no-op.

-- 1) project_members: unique (project_id, user_id) lets ON CONFLICT DO NOTHING do the work.
insert into public.project_members (project_id, user_id, role_on_project)
select p.id, p.pm_id, 'Project Manager'
from public.projects p
where p.pm_id is not null
on conflict (project_id, user_id) do nothing;

-- 2) assignments: no unique constraint to conflict on, so guard with NOT EXISTS instead.
-- Only runs for a PM who has a linked `people` row (assignments.person_id -> people.id) --
-- a PM without one has no time-logging identity to backfill an assignment for anyway.
insert into public.assignments (project_id, person_id, role_on_project, allocation_pct, start_date)
select p.id, pe.id, 'Project Manager', 100, coalesce(p.start_date, current_date)
from public.projects p
join public.people pe on pe.user_id = p.pm_id
where p.pm_id is not null
  and not exists (
    select 1 from public.assignments a
    where a.project_id = p.id and a.person_id = pe.id
  );
