-- Phase 4, Task 1: workload read-model for the People directory.
--
-- person_workload_rows MUST be `security_invoker = true` (Postgres 15+) -- same reasoning as
-- `project_list_rows` (20260715000007_project_views.sql): a plain view runs with the privileges
-- of its OWNER (the migration role, which owns every table and bypasses RLS), so an
-- owner-invoker view here would leak every person's internal cost and billing rate to every
-- authenticated caller regardless of their actual permission. With security_invoker, every join
-- re-runs under the CALLING user's row security, exactly as if they'd written the joins
-- themselves. The `rates` table's own RLS policy ("finance reads rates", 20260715000004) already
-- requires `view_internal_cost`; the LEFT JOIN below just means a non-finance caller's join
-- simply returns no matching row (RLS hides it), so internal_cost/billing_rate come back null
-- and the UI renders "—" -- the gating lives entirely in existing RLS, not in this view.
--
-- current_allocation_pct / active_project_count: summed/counted over the caller-visible rows of
-- `assignments` where CURRENT_DATE falls in [start_date, coalesce(end_date, 'infinity')]. The
-- `assignments` RLS policy ("view assignments") already grants a caller either global visibility
-- (view_team) or their own rows (person_id = current_person_id()) -- this view does not widen
-- that; it only aggregates whatever the caller could already see. Since `view_people` is granted
-- globally to every seeded role, and workload numbers should be visible to any caller who can see
-- the directory at all (not just those with view_team on that particular project), we deliberately
-- do NOT filter this aggregation down to view_team-visible assignments only -- every authenticated
-- role in this codebase currently ends up able to see assignments for any person they can see in
-- the directory (member: their own; PM/finance/admin: global). If that ever changes, this
-- aggregation would need its own explicit scoping; documented here so it isn't a silent surprise.
--
-- skills: text[] of skill names via person_skills -> skills, gated by the existing "view skills"
-- / "view person_skills" policies (both require view_people, same as the base people row).
--
-- on_vacation_now: true if a time_off row of type 'vacation' covers today. The "view time_off"
-- policy already restricts non-owning/non-privileged callers to vacation-only rows anyway, so this
-- boolean is safe to expose broadly (sick leave never surfaces through this column).

create view public.person_workload_rows
with (security_invoker = true)
as
select
  p.id,
  p.full_name,
  p.avatar_url,
  p.role_title,
  p.department,
  p.employment_type,
  p.weekly_capacity_hours,
  p.status,
  coalesce(alloc.current_allocation_pct, 0) as current_allocation_pct,
  coalesce(alloc.active_project_count, 0) as active_project_count,
  coalesce(vac.on_vacation_now, false) as on_vacation_now,
  coalesce(sk.skills, '{}'::text[]) as skills,
  cost.amount as internal_cost,
  billing.amount as billing_rate
from public.people p
left join lateral (
  select
    sum(a.allocation_pct) as current_allocation_pct,
    count(distinct a.project_id)::int as active_project_count
  from public.assignments a
  where a.person_id = p.id
    and current_date between a.start_date and coalesce(a.end_date, 'infinity'::date)
) alloc on true
left join lateral (
  select exists (
    select 1 from public.time_off t
    where t.person_id = p.id
      and t.type = 'vacation'
      and current_date between t.starts_on and t.ends_on
  ) as on_vacation_now
) vac on true
left join lateral (
  select array_agg(s.name order by s.name) as skills
  from public.person_skills ps
  join public.skills s on s.id = ps.skill_id
  where ps.person_id = p.id
) sk on true
left join lateral (
  select r.amount
  from public.rates r
  where r.person_id = p.id and r.rate_type = 'internal_cost'
  order by r.valid_from desc
  limit 1
) cost on true
left join lateral (
  select r.amount
  from public.rates r
  where r.person_id = p.id and r.rate_type = 'billing'
  order by r.valid_from desc
  limit 1
) billing on true;

grant select on public.person_workload_rows to authenticated;
grant select on public.person_workload_rows to service_role;
