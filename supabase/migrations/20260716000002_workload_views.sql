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
-- current_allocation_pct / active_project_count: these are DELIBERATELY NOT computed from the
-- caller-visible rows of `assignments`. The "view assignments" RLS policy only grants a caller
-- rows where they hold view_team on that specific project (member_projects scope -- i.e. they're
-- a project_members row on that project) or the row is their own (person_id = current_person_id()).
-- A member who shares only SOME projects with a colleague would therefore see that colleague's
-- assignments on shared projects but NOT on the colleague's other projects, understating the
-- aggregate badly (e.g. a person 100% booked across two projects could show 0%/"Available" to a
-- member who only overlaps on neither). The aggregate "how booked is this person, overall" is
-- operational capacity info every `view_people` holder needs and is NOT sensitive -- unlike WHICH
-- projects they're on, which stays RLS-scoped via `assignments` as before. So these two columns are
-- computed via `public.person_current_allocation()`, a SECURITY DEFINER function that sums ALL
-- active assignments globally and returns only the two numbers (never project ids/names); no
-- project-level detail is exposed through it. Per-project assignment detail elsewhere in the app
-- continues to go through the RLS-scoped `assignments` table/policies directly.
--
-- skills: text[] of skill names via person_skills -> skills, gated by the existing "view skills"
-- / "view person_skills" policies (both require view_people, same as the base people row).
--
-- on_vacation_now: true if a time_off row of type 'vacation' covers today. The "view time_off"
-- policy already restricts non-owning/non-privileged callers to vacation-only rows anyway, so this
-- boolean is safe to expose broadly (sick leave never surfaces through this column).

-- Aggregate capacity is not sensitive (unlike which projects) — expose the TRUE total to
-- every view_people holder via a definer sum, while per-project detail stays RLS-scoped.
create or replace function public.person_current_allocation(p_person uuid)
returns table (allocation_pct numeric, project_count int)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(a.allocation_pct), 0)::numeric,
         count(distinct a.project_id)::int
  from public.assignments a
  where a.person_id = p_person
    and current_date between a.start_date and coalesce(a.end_date, 'infinity');
$$;
revoke all on function public.person_current_allocation(uuid) from public, anon;
grant execute on function public.person_current_allocation(uuid) to authenticated;

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
  coalesce(alloc.allocation_pct, 0) as current_allocation_pct,
  coalesce(alloc.project_count, 0) as active_project_count,
  coalesce(vac.on_vacation_now, false) as on_vacation_now,
  coalesce(sk.skills, '{}'::text[]) as skills,
  cost.amount as internal_cost,
  billing.amount as billing_rate
from public.people p
left join lateral public.person_current_allocation(p.id) alloc on true
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
