-- Away with a return date: the employees list/detail show "Away until <date>", so the view must
-- expose WHEN the current vacation ends, not just that one exists. Same exposure rationale as
-- on_vacation_now (20260716000002): only type='vacation' rows are consulted -- the "view time_off"
-- policy already limits broad callers to vacation rows, so sick leave never surfaces here.
-- max(ends_on) handles overlapping vacation entries by reporting the latest return date.
--
-- create-or-replace can't insert a column mid-list, so drop + recreate (nothing else in the
-- schema depends on this view); security_invoker and grants restated below -- see the original
-- migration for why invoker rights are load-bearing (rates RLS gates cost/rate columns).

drop view public.person_workload_rows;

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
  (vac.vacation_ends_on is not null) as on_vacation_now,
  vac.vacation_ends_on,
  coalesce(sk.skills, '{}'::text[]) as skills,
  cost.amount as internal_cost,
  billing.amount as billing_rate
from public.people p
left join lateral public.person_current_allocation(p.id) alloc on true
left join lateral (
  select max(t.ends_on) as vacation_ends_on
  from public.time_off t
  where t.person_id = p.id
    and t.type = 'vacation'
    and current_date between t.starts_on and t.ends_on
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
