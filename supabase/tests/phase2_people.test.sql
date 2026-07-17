begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- fixtures: PM Paula (owns PX), member Milo (person + user, member of PX), finance Frank
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('d0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','paula@test.local','{"full_name":"Paula"}','{}','',now(),now()),
  ('d0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','milo@test.local','{"full_name":"Milo"}','{}','',now(),now()),
  ('d0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','frank@test.local','{"full_name":"Frank"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'd0000000-%';
insert into public.user_roles (user_id, role_key) values
  ('d0000000-0000-4000-8000-000000000001','project_manager'),
  ('d0000000-0000-4000-8000-000000000002','member'),
  ('d0000000-0000-4000-8000-000000000003','finance');

insert into public.projects (id, name, pm_id, budget_type) values
  ('d2000000-0000-4000-8000-000000000001','PX','d0000000-0000-4000-8000-000000000001','hourly');
insert into public.project_members (project_id, user_id) values
  ('d2000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002');
insert into public.project_parts (id, project_id, name, billing_model) values
  ('d3000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','Backend','hourly');
insert into public.people (id, user_id, full_name, weekly_capacity_hours) values
  ('d4000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002','Milo Dev', 40);
insert into public.rates (person_id, rate_type, amount, valid_from) values
  ('d4000000-0000-4000-8000-000000000001','internal_cost', 45, current_date),
  ('d4000000-0000-4000-8000-000000000001','billing', 95, current_date);
insert into public.assignments (project_id, project_part_id, person_id, allocation_pct, start_date, end_date) values
  ('d2000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001', 60, current_date - 10, current_date + 30);

-- second project: Milo has NEITHER a membership NOR an assignment here (used to prove
-- log_time requires a project relationship -- membership or assignment)
insert into public.projects (id, name, pm_id, budget_type) values
  ('d2000000-0000-4000-8000-000000000002','PY',null,'hourly');

-- third project: Milo is a project_members row here but has NO assignment (used to prove
-- log_time now accepts membership alone, not just an assignment)
insert into public.projects (id, name, pm_id, budget_type) values
  ('d2000000-0000-4000-8000-000000000003','PZ',null,'hourly');
insert into public.project_members (project_id, user_id) values
  ('d2000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000002');

-- Milo's time_off: one sick (directory-hidden), one vacation (directory-visible)
insert into public.time_off (person_id, starts_on, ends_on, type, note) values
  ('d4000000-0000-4000-8000-000000000001', current_date, current_date + 2, 'sick', 'flu'),
  ('d4000000-0000-4000-8000-000000000001', current_date + 10, current_date + 12, 'vacation', null);

-- finance sees rates
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"d0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.rates where person_id = 'd4000000-0000-4000-8000-000000000001'), 2, 'finance sees rates');
-- finance holds view_people but NOT manage_people -- sick leave stays hidden, only the
-- vacation entry is visible (the "view time_off" vacation-only branch of the policy).
select is((select count(*)::int from public.time_off where person_id = 'd4000000-0000-4000-8000-000000000001'), 1, 'sick leave hidden from a view_people-only caller');

-- PM does NOT see rates (internal cost is finance-only per spec)
set local "request.jwt.claims" to '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.rates where person_id = 'd4000000-0000-4000-8000-000000000001'), 0, 'PM cannot see rates');
select is((select count(*)::int from public.people where id = 'd4000000-0000-4000-8000-000000000001'), 1, 'PM sees people directory');
select is((select count(*)::int from public.assignments where project_id = 'd2000000-0000-4000-8000-000000000001'), 1, 'PM sees assignments (workload)');
-- Since 20260716000004 (manage_people granted to project_manager), a PM is a manage_people
-- holder too and the "view time_off" policy's manage_people branch bypasses the vacation-only
-- restriction for them -- same as it always has for admins. PMs now legitimately need full
-- time-off visibility (sick included) to actually manage the people they're responsible for.
select is((select count(*)::int from public.time_off where person_id = 'd4000000-0000-4000-8000-000000000001'), 2, 'PM (holds manage_people) sees full time_off incl. sick leave');

-- member Milo: sees own person row, logs time on own assignment, cannot log for others
set local "request.jwt.claims" to '{"sub":"d0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.people where id = 'd4000000-0000-4000-8000-000000000001'), 1, 'member sees directory');
select is((select count(*)::int from public.rates), 0, 'member sees no rates');
select lives_ok(
  $$ insert into public.time_entries (person_id, project_id, project_part_id, entry_date, hours, billable)
     values ('d4000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001', current_date, 6, true) $$,
  'member logs own time (via assignment)');
select lives_ok(
  $$ insert into public.time_entries (person_id, project_id, project_part_id, entry_date, hours, billable)
     values ('d4000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000003',null, current_date, 4, true) $$,
  'member logs own time on a project they are only a MEMBER of (no assignment)');
select throws_ok(
  $$ insert into public.time_entries (person_id, project_id, project_part_id, entry_date, hours, billable)
     values (gen_random_uuid(),'d2000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001', current_date, 6, true) $$,
  '42501', null, 'member cannot log time as someone else');
select is((select count(*)::int from public.time_entries where project_id = 'd2000000-0000-4000-8000-000000000001'), 1, 'member reads own entries');
select throws_ok(
  $$ insert into public.time_entries (person_id, project_id, project_part_id, entry_date, hours, billable)
     values ('d4000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002',null, current_date, 6, true) $$,
  '42501', null, 'cannot log time on a project with neither membership nor assignment');
select is((select count(*)::int from public.time_off where person_id = 'd4000000-0000-4000-8000-000000000001'), 2, 'member sees own time_off (sick + vacation)');

-- edit-own-time RLS: WITH CHECK must also enforce project membership/assignment on the
-- (possibly changed) project_id, mirroring "log own time" -- otherwise a member could
-- re-point their own entry onto a project they have no relationship to. PY (0002) is a
-- project Milo has neither a membership nor an assignment on (see fixture above).
select lives_ok(
  $$ insert into public.time_entries (person_id, project_id, project_part_id, entry_date, hours, billable)
     values ('d4000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001', current_date, 3, true) $$,
  'member logs a second own time entry on PX (for edit tests below)');
select throws_ok(
  $$ update public.time_entries set project_id = 'd2000000-0000-4000-8000-000000000002'
     where person_id = 'd4000000-0000-4000-8000-000000000001' and project_id = 'd2000000-0000-4000-8000-000000000001' and hours = 3 $$,
  '42501', null, 'cannot re-point time entry to a foreign project');
select lives_ok(
  $$ update public.time_entries set hours = 3.5, entry_date = current_date
     where person_id = 'd4000000-0000-4000-8000-000000000001' and project_id = 'd2000000-0000-4000-8000-000000000001' and hours = 3 $$,
  'member edits hours/date on the same (valid) project still succeeds');

select * from finish();
rollback;
