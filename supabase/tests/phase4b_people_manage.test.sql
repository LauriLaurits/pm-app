begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- fixtures: PM Priya, member Mike
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('e0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','priya@test.local','{"full_name":"Priya"}','{}','',now(),now()),
  ('e0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mike@test.local','{"full_name":"Mike"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'e0000000-%';
insert into public.user_roles (user_id, role_key) values
  ('e0000000-0000-4000-8000-000000000001','project_manager'),
  ('e0000000-0000-4000-8000-000000000002','member');

insert into public.projects (id, name, pm_id, budget_type) values
  ('e2000000-0000-4000-8000-000000000001','PZ','e0000000-0000-4000-8000-000000000001','hourly');
insert into public.project_parts (id, project_id, name, billing_model) values
  ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','Backend','hourly');

-- a person with an existing assignment -- used to prove the delete-guard trigger
insert into public.people (id, full_name, weekly_capacity_hours) values
  ('e4000000-0000-4000-8000-000000000001','Assigned Ada', 40);
insert into public.assignments (project_id, project_part_id, person_id, allocation_pct, start_date) values
  ('e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001', 50, current_date);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ insert into public.people (id, full_name, weekly_capacity_hours) values ('e4000000-0000-4000-8000-000000000002','New Nate', 40) $$,
  'PM can now insert a person (manage_people granted)');

select lives_ok(
  $$ update public.people set role_title = 'Engineer' where id = 'e4000000-0000-4000-8000-000000000002' $$,
  'PM can update a person');

select throws_ok(
  $$ delete from public.people where id = 'e4000000-0000-4000-8000-000000000001' $$,
  '23503', null,
  'delete-guard blocks deleting a person with an assignment');

select lives_ok(
  $$ delete from public.people where id = 'e4000000-0000-4000-8000-000000000002' $$,
  'PM can hard-delete a person with no assignments/time history');

set local "request.jwt.claims" to '{"sub":"e0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ insert into public.people (full_name, weekly_capacity_hours) values ('Member Attempt', 40) $$,
  '42501', null,
  'member still cannot insert a person (no manage_people grant)');

select * from finish();
rollback;
