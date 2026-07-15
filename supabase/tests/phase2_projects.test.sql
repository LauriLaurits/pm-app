begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- fixtures: PM Anna (owns P1), PM Bella (owns P2), member Max (member of P1 only), finance Fia
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('c0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','anna@test.local','{"full_name":"Anna"}','{}','',now(),now()),
  ('c0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','bella@test.local','{"full_name":"Bella"}','{}','',now(),now()),
  ('c0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','max@test.local','{"full_name":"Max"}','{}','',now(),now()),
  ('c0000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fia@test.local','{"full_name":"Fia"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'c0000000-%';
insert into public.user_roles (user_id, role_key) values
  ('c0000000-0000-4000-8000-000000000001','project_manager'),
  ('c0000000-0000-4000-8000-000000000002','project_manager'),
  ('c0000000-0000-4000-8000-000000000003','member'),
  ('c0000000-0000-4000-8000-000000000004','finance');

insert into public.clients (id, name) values ('c1000000-0000-4000-8000-000000000001','ACME');
insert into public.projects (id, name, client_id, pm_id, status, health, budget_type) values
  ('c2000000-0000-4000-8000-000000000001','P1','c1000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','active','healthy','fixed'),
  ('c2000000-0000-4000-8000-000000000002','P2','c1000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002','active','warning','hourly');
insert into public.project_members (project_id, user_id, role_on_project) values
  ('c2000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000003','developer');
insert into public.project_links (project_id, name, url, type, visibility) values
  ('c2000000-0000-4000-8000-000000000001','Repo','https://github.com/acme/p1','repo','project'),
  ('c2000000-0000-4000-8000-000000000001','Prod DB','https://db.acme','db_dashboard','pm_only');
insert into public.project_parts (id, project_id, name, billing_model) values
  ('c3000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','P1 Part','fixed'),
  ('c3000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000002','P2 Part','fixed');

-- member Max: sees only P1; cannot edit it; sees project-visibility links but not pm_only
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.projects where id::text like 'c2000000-%'), 1, 'member sees only assigned project');
select is((select count(*)::int from public.project_links where project_id = 'c2000000-0000-4000-8000-000000000001'), 1, 'member sees project links but not pm_only');
select is((select count(*)::int from public.projects where id::text like 'c2000000-%' and public.has_permission(auth.uid(),'edit_project', id)), 0, 'member cannot edit');
select throws_ok(
  $$ insert into public.projects (name, budget_type) values ('Rogue','fixed') $$,
  '42501', null, 'member cannot create projects');

-- PM Anna: sees both projects (global view), edits only her own, sees pm_only links on P1
set local "request.jwt.claims" to '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.projects where id::text like 'c2000000-%'), 2, 'PM sees the whole portfolio');
select is(public.has_permission(auth.uid(),'edit_project','c2000000-0000-4000-8000-000000000001'), true,  'PM edits own project');
select is(public.has_permission(auth.uid(),'edit_project','c2000000-0000-4000-8000-000000000002'), false, 'PM cannot edit another PM''s project');
select is((select count(*)::int from public.project_links where project_id = 'c2000000-0000-4000-8000-000000000001'), 2, 'PM sees pm_only links on own project');
select lives_ok(
  $$ insert into public.project_status_updates (project_id, author_id, completed, in_progress) values ('c2000000-0000-4000-8000-000000000001', auth.uid(), 'API done','UI ongoing') $$,
  'PM posts status update on own project');
select throws_ok(
  $$ update public.project_status_updates set completed = 'rewritten history' where project_id = 'c2000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'status updates are immutable');
select throws_ok(
  $$ insert into public.part_dependencies (part_id, depends_on_part_id)
     values ('c3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000002') $$,
  'P0001', 'part dependencies must stay within one project',
  'cross-project dependency rejected');
select throws_ok(
  $$ insert into public.projects (name, budget_type, pm_id)
     values ('Spoofed', 'fixed', 'c0000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'PM cannot create a project owned by someone else');
select lives_ok(
  $$ insert into public.projects (name, budget_type, pm_id)
     values ('Own new project', 'fixed', auth.uid()) $$,
  'PM creates own project');

-- finance Fia: portfolio visibility without membership
set local "request.jwt.claims" to '{"sub":"c0000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select count(*)::int from public.projects where id::text like 'c2000000-%'), 2, 'finance sees all projects');
select is((select count(*)::int from public.clients where id::text like 'c1000000-%'), 1, 'finance sees clients');

select * from finish();
rollback;
