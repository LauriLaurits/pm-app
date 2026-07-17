-- Backfill: a project's PM has never been required to also be a `project_members` row --
-- that's the "PM isn't a member of their own project" gap (People tab shows no PM, and the
-- PM couldn't log time since "log own time" only checked `assignments`). createProjectAction
-- now inserts a project_members row for every NEW project; this migration gives every EXISTING
-- project the same invariant, idempotently, so re-running it is always a no-op.
--
-- No `assignments` backfill here: a synthetic 100%-allocation assignments row per PM-owned
-- project inflated workload allocation (a PM managing N projects showed N*100% allocated,
-- breaking /workload and the People directory). "log own time" now accepts membership OR
-- assignment, so project_members alone is sufficient for a PM to log time on their own project.

-- project_members: unique (project_id, user_id) lets ON CONFLICT DO NOTHING do the work.
insert into public.project_members (project_id, user_id, role_on_project)
select p.id, p.pm_id, 'Project Manager'
from public.projects p
where p.pm_id is not null
on conflict (project_id, user_id) do nothing;
