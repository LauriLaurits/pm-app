begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- fixtures: PM Priya (manages the project), member Mike (linked to a person row)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('e0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','priya@test.local','{"full_name":"Priya"}','{}','',now(),now()),
  ('e0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mike@test.local','{"full_name":"Mike"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'e0000000-%';
insert into public.user_roles (user_id, role_key) values
  ('e0000000-0000-4000-8000-000000000001','project_manager'),
  ('e0000000-0000-4000-8000-000000000002','member');

insert into public.projects (id, name, pm_id, budget_type) values
  ('e2000000-0000-4000-8000-000000000001','PZ','e0000000-0000-4000-8000-000000000001','hourly');

-- Mike has a person row linked to his user account (required to be added to a project).
insert into public.people (id, user_id, full_name, weekly_capacity_hours) values
  ('e4000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000002','Mike', 40);

-- ---- monthly time cap (a plain CHECK constraint; tested as owner, RLS-independent) ----
select lives_ok(
  $$ insert into public.time_entries (person_id, project_id, entry_date, hours, billable)
     values ('e4000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001','2026-05-01', 60, true) $$,
  'a 60h monthly total now inserts (24h/entry cap lifted)');

select throws_ok(
  $$ insert into public.time_entries (person_id, project_id, entry_date, hours, billable)
     values ('e4000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001','2026-06-01', 745, true) $$,
  '23514', null,
  'hours above the 744 monthly ceiling are still rejected');

-- ---- add_project_person: atomic member + allocation, gated on manage_project_members ----
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ select public.add_project_person('e2000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','Backend', 50, '2026-05-01', null) $$,
  'PM can add a person with an allocation');

select is(
  (select allocation_pct from public.assignments
   where project_id='e2000000-0000-4000-8000-000000000001' and person_id='e4000000-0000-4000-8000-000000000002' and project_part_id is null),
  50::numeric,
  'the add created a project-level assignment at 50%');

select is(
  (select count(*)::int from public.project_members
   where project_id='e2000000-0000-4000-8000-000000000001' and user_id='e0000000-0000-4000-8000-000000000002'),
  1,
  'the add created exactly one access (project_members) row');

-- Each mutation is its own statement (a function call inside the same SELECT as the assertion
-- would be invisible to the assertion's scalar subquery under MVCC snapshot rules).
select public.add_project_person('e2000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','Lead', 80, '2026-05-01', null);
select is(
  (select count(*)::int from public.assignments
   where project_id='e2000000-0000-4000-8000-000000000001' and person_id='e4000000-0000-4000-8000-000000000002' and project_part_id is null),
  1,
  'adding again updates the same assignment (no duplicate)');

select public.set_person_allocation('e2000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002', 30);
select is(
  (select allocation_pct from public.assignments
   where project_id='e2000000-0000-4000-8000-000000000001' and person_id='e4000000-0000-4000-8000-000000000002' and project_part_id is null),
  30::numeric,
  'set_person_allocation updates the allocation in place');

select public.remove_project_person('e2000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002');
select is(
  (select count(*)::int from public.assignments a where a.project_id='e2000000-0000-4000-8000-000000000001' and a.person_id='e4000000-0000-4000-8000-000000000002')
    + (select count(*)::int from public.project_members m where m.project_id='e2000000-0000-4000-8000-000000000001' and m.user_id='e0000000-0000-4000-8000-000000000002'),
  0,
  'remove_project_person deletes both the allocation and the access');

-- ---- gating: a member without manage_project_members cannot add anyone ----
set local "request.jwt.claims" to '{"sub":"e0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.add_project_person('e2000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','Backend', 50, '2026-05-01', null) $$,
  'P0001', 'not authorized',
  'a non-manager is refused by add_project_person');

select * from finish();
rollback;
