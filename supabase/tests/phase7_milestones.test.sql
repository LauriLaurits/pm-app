begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- fixtures: PM Paula (owns the project), member Mia (on the project), member Noah (not on it)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('ab000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','paula@test.local','{"full_name":"Paula"}','{}','',now(),now()),
  ('ab000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mia@test.local','{"full_name":"Mia"}','{}','',now(),now()),
  ('ab000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','noah@test.local','{"full_name":"Noah"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'ab000000-%';
insert into public.user_roles (user_id, role_key) values
  ('ab000000-0000-4000-8000-000000000001','project_manager'),
  ('ab000000-0000-4000-8000-000000000002','member'),
  ('ab000000-0000-4000-8000-000000000003','member');

-- project starts with NO dates: the milestones below must be what sets them
insert into public.projects (id, name, pm_id, budget_type) values
  ('ab200000-0000-4000-8000-000000000001','MZ','ab000000-0000-4000-8000-000000000001','fixed');
insert into public.project_members (project_id, user_id, role_on_project) values
  ('ab200000-0000-4000-8000-000000000001','ab000000-0000-4000-8000-000000000002','dev');

-- ---- sync trigger + partial unique indexes (tested as owner, RLS-independent) ----
select lives_ok(
  $$ insert into public.project_milestones (id, project_id, name, due_on, kind)
     values ('ab300000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001','Kickoff','2026-03-01','start') $$,
  'a start milestone inserts');

select is(
  (select start_date from public.projects where id='ab200000-0000-4000-8000-000000000001'),
  '2026-03-01'::date,
  'inserting a start milestone syncs projects.start_date');

insert into public.project_milestones (id, project_id, name, due_on, kind)
  values ('ab300000-0000-4000-8000-000000000002','ab200000-0000-4000-8000-000000000001','Go-live','2026-12-01','end');
select is(
  (select deadline from public.projects where id='ab200000-0000-4000-8000-000000000001'),
  '2026-12-01'::date,
  'inserting an end milestone syncs projects.deadline');

update public.project_milestones set due_on='2026-03-15'
  where id='ab300000-0000-4000-8000-000000000001';
select is(
  (select start_date from public.projects where id='ab200000-0000-4000-8000-000000000001'),
  '2026-03-15'::date,
  'moving the start milestone moves projects.start_date with it');

insert into public.project_milestones (project_id, name, due_on)
  values ('ab200000-0000-4000-8000-000000000001','Design sign-off','2026-06-01');
select is(
  (select (start_date, deadline) from public.projects where id='ab200000-0000-4000-8000-000000000001'),
  ('2026-03-15'::date, '2026-12-01'::date),
  'a plain milestone kind leaves both project dates untouched');

select throws_ok(
  $$ insert into public.project_milestones (project_id, name, due_on, kind)
     values ('ab200000-0000-4000-8000-000000000001','Second kickoff','2026-04-01','start') $$,
  '23505', null,
  'a second start milestone per project is rejected (partial unique index)');

delete from public.project_milestones where id='ab300000-0000-4000-8000-000000000001';
select is(
  (select start_date from public.projects where id='ab200000-0000-4000-8000-000000000001'),
  '2026-03-15'::date,
  'deleting the start milestone leaves the last-known start_date in place');

-- ---- RLS: view follows view_project, writes follow edit_project ----
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"ab000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ insert into public.project_milestones (project_id, name, due_on)
     values ('ab200000-0000-4000-8000-000000000001','UAT','2026-10-01') $$,
  'the PM (edit_project via own project) can add a milestone');

set local "request.jwt.claims" to '{"sub":"ab000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select count(*)::int from public.project_milestones where project_id='ab200000-0000-4000-8000-000000000001'),
  3,
  'a project member (view_project) sees every milestone of the project');

select throws_ok(
  $$ insert into public.project_milestones (project_id, name, due_on)
     values ('ab200000-0000-4000-8000-000000000001','Sneaky','2026-11-01') $$,
  '42501', null,
  'a member without edit_project cannot add a milestone');

-- a member's UPDATE silently matches no rows under RLS -- the done flag must not change
update public.project_milestones set done=true where project_id='ab200000-0000-4000-8000-000000000001';
reset role;
select is(
  (select count(*)::int from public.project_milestones
   where project_id='ab200000-0000-4000-8000-000000000001' and done),
  0,
  'a member without edit_project cannot toggle done');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"ab000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(
  (select count(*)::int from public.project_milestones where project_id='ab200000-0000-4000-8000-000000000001'),
  0,
  'a non-member sees no milestones at all');

select * from finish();
rollback;
