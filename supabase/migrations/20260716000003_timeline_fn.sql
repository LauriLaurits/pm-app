-- Phase 4, Task 3: per-person, per-week TOTAL allocation for the Workload timeline.
--
-- Same reasoning as `public.person_current_allocation` (20260716000002_workload_views.sql), just
-- windowed instead of "as of today": a plain member's RLS-scoped view of `assignments` only
-- includes rows where they hold view_team on that specific project (a project_members row) or the
-- row is their own. Summing a colleague's allocation FROM THAT RLS-SCOPED QUERY would understate
-- it whenever the colleague has assignments on projects the viewer doesn't share -- e.g. a person
-- booked 70% + 60% across two projects could render as a falsely-empty/green "30%" cell to a
-- viewer who only overlaps on one of them. The timeline's CELL COLOR is "how booked is this person
-- this week" -- operational capacity signal every `view_people` holder needs, and it is NOT
-- sensitive (unlike WHICH projects, which stays RLS-scoped). So the aggregate is computed by this
-- SECURITY DEFINER function, which sums ALL of a person's assignments globally per week and
-- returns ONLY (week_start, allocation_pct) -- never a project id or name. Any per-cell tooltip
-- listing project names must be built from a separate, ordinary RLS-scoped `assignments` query in
-- the caller (see workload/page.tsx), never from this function.
create or replace function public.person_weekly_allocation(p_person uuid, p_from date, p_weeks int)
returns table (week_start date, allocation_pct numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    ws::date as week_start,
    coalesce((
      select sum(a.allocation_pct)
      from public.assignments a
      where a.person_id = p_person
        and a.start_date <= (ws::date + 6)
        and coalesce(a.end_date, 'infinity'::date) >= ws::date
    ), 0)::numeric as allocation_pct
  from generate_series(
    date_trunc('week', p_from)::date,
    date_trunc('week', p_from)::date + (greatest(coalesce(p_weeks, 1), 1) - 1) * 7,
    interval '7 days'
  ) as ws;
$$;

revoke all on function public.person_weekly_allocation(uuid, date, int) from public, anon;
grant execute on function public.person_weekly_allocation(uuid, date, int) to authenticated;
