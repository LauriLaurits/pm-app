begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

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

-- finance sees rates
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"d0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.rates where person_id = 'd4000000-0000-4000-8000-000000000001'), 2, 'finance sees rates');

-- PM does NOT see rates (internal cost is finance-only per spec)
set local "request.jwt.claims" to '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.rates where person_id = 'd4000000-0000-4000-8000-000000000001'), 0, 'PM cannot see rates');
select is((select count(*)::int from public.people where id = 'd4000000-0000-4000-8000-000000000001'), 1, 'PM sees people directory');
select is((select count(*)::int from public.assignments where project_id = 'd2000000-0000-4000-8000-000000000001'), 1, 'PM sees assignments (workload)');

-- member Milo: sees own person row, logs time on own assignment, cannot log for others
set local "request.jwt.claims" to '{"sub":"d0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.people where id = 'd4000000-0000-4000-8000-000000000001'), 1, 'member sees directory');
select is((select count(*)::int from public.rates), 0, 'member sees no rates');
select lives_ok(
  $$ insert into public.time_entries (person_id, project_id, project_part_id, entry_date, hours, billable)
     values ('d4000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001', current_date, 6, true) $$,
  'member logs own time');
select throws_ok(
  $$ insert into public.time_entries (person_id, project_id, project_part_id, entry_date, hours, billable)
     values (gen_random_uuid(),'d2000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001', current_date, 6, true) $$,
  '42501', null, 'member cannot log time as someone else');
select is((select count(*)::int from public.time_entries where project_id = 'd2000000-0000-4000-8000-000000000001'), 1, 'member reads own entries');

select * from finish();
rollback;
