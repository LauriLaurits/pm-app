begin;
create extension if not exists pgtap with schema extensions;
select plan(6);
-- 1 correct total on the assignment's own week, 2 zero outside the assignment window,
-- 3 sums two overlapping assignments in the same week, 4 five-row window length,
-- 5 week_start values are Mondays 7 days apart, 6 member sees a colleague's TRUE weekly
-- allocation via the function even for a project the member cannot see at all.

-- fixtures: a PM Priya, member Max (project overlap on only one of two projects), a project PA
-- (Max is a project_members row here) and PB (Max has NO access at all); WorkerTwo has 70% on PA
-- and 60% on PB overlapping the same week -> TRUE total 130% (overallocated), but the RLS-scoped
-- `assignments` rows visible to Max would only include the PA row (70%, "partial") if summed
-- naively -- person_weekly_allocation must still return 130 for that week regardless of caller.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('e1000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','priya@test.local','{"full_name":"Priya"}','{}','',now(),now()),
  ('e1000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','max@test.local','{"full_name":"Max"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'e1000000-%';
insert into public.user_roles (user_id, role_key) values
  ('e1000000-0000-4000-8000-000000000001','project_manager'),
  ('e1000000-0000-4000-8000-000000000002','member');

insert into public.projects (id, name, pm_id, budget_type) values
  ('e3000000-0000-4000-8000-000000000001','PA','e1000000-0000-4000-8000-000000000001','hourly'),
  ('e3000000-0000-4000-8000-000000000002','PB','e1000000-0000-4000-8000-000000000001','hourly');

-- Max is a project_members row on PA only -- gives Max view_team on PA but NOT on PB, so the
-- "view assignments" RLS policy hides WorkerTwo's PB row from Max entirely.
insert into public.project_members (project_id, user_id, role_on_project) values
  ('e3000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','contributor');

insert into public.people (id, user_id, full_name, weekly_capacity_hours) values
  ('e5000000-0000-4000-8000-000000000001', null, 'Worker Two', 40),
  ('e5000000-0000-4000-8000-000000000002', null, 'Worker One', 40);

-- WorkerTwo: 70% on PA + 60% on PB, both spanning today's week -> 130% that week.
insert into public.assignments (project_id, project_part_id, person_id, allocation_pct, start_date, end_date) values
  ('e3000000-0000-4000-8000-000000000001', null, 'e5000000-0000-4000-8000-000000000001', 70, current_date - 30, current_date + 30),
  ('e3000000-0000-4000-8000-000000000002', null, 'e5000000-0000-4000-8000-000000000001', 60, current_date - 30, current_date + 30);

-- WorkerOne: single 40% assignment on PA, ending before the window we'll query starting 8 weeks
-- out -- exercises the "zero outside the assignment window" + "correct total on its own week".
insert into public.assignments (project_id, project_part_id, person_id, allocation_pct, start_date, end_date) values
  ('e3000000-0000-4000-8000-000000000001', null, 'e5000000-0000-4000-8000-000000000002', 40, current_date - 10, current_date + 3);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- 1: WorkerOne's week containing today shows 40
select is(
  (select allocation_pct from public.person_weekly_allocation('e5000000-0000-4000-8000-000000000002'::uuid, current_date, 1) where week_start = date_trunc('week', current_date)::date),
  40::numeric,
  'WorkerOne: current week allocation_pct = 40 (single active assignment)'
);

-- 2: a week well past WorkerOne's end_date is 0
select is(
  (select allocation_pct from public.person_weekly_allocation('e5000000-0000-4000-8000-000000000002'::uuid, current_date, 12) where week_start = date_trunc('week', current_date + 70)::date),
  0::numeric,
  'WorkerOne: a week 10 weeks out (past end_date) is 0 (free)'
);

-- 3: WorkerTwo's current week sums both overlapping assignments to 130
select is(
  (select allocation_pct from public.person_weekly_allocation('e5000000-0000-4000-8000-000000000001'::uuid, current_date, 1) where week_start = date_trunc('week', current_date)::date),
  130::numeric,
  'WorkerTwo: current week sums two overlapping assignments to 130 (overallocated)'
);

-- 4: requesting 5 weeks returns exactly 5 rows
select is(
  (select count(*)::int from public.person_weekly_allocation('e5000000-0000-4000-8000-000000000001'::uuid, current_date, 5)),
  5,
  'requesting 5 weeks returns exactly 5 rows'
);

-- 5: week_starts are 7 days apart (Monday-anchored)
select is(
  (select array_agg(week_start order by week_start) from public.person_weekly_allocation('e5000000-0000-4000-8000-000000000001'::uuid, current_date, 3)),
  array[
    date_trunc('week', current_date)::date,
    date_trunc('week', current_date)::date + 7,
    date_trunc('week', current_date)::date + 14
  ],
  'week_start values are 7 days apart, anchored to the Monday of p_from''s week'
);

-- 6: member Max only shares PA with WorkerTwo (not PB) -- if this were computed from the
-- RLS-scoped `assignments` rows Max can see directly, PB's 60% row would be invisible and the
-- current week would understate to 70 ("partial", not loud red). It must instead reflect
-- WorkerTwo's TRUE global sum of 130 because person_weekly_allocation is SECURITY DEFINER and
-- sums globally, never filtered by the caller's RLS visibility.
set local "request.jwt.claims" to '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select allocation_pct from public.person_weekly_allocation('e5000000-0000-4000-8000-000000000001'::uuid, current_date, 1) where week_start = date_trunc('week', current_date)::date),
  130::numeric,
  'partial-overlap member Max still sees WorkerTwo''s TRUE weekly allocation = 130 (not the RLS-understated 70)'
);

select * from finish();
rollback;
