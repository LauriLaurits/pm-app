begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- fixtures: PM Vera (owns V1), stand-in Sam (member role), outsider Otto (member role, no relation)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('f0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','vera@test.local','{"full_name":"Vera"}','{}','',now(),now()),
  ('f0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sam@test.local','{"full_name":"Sam"}','{}','',now(),now()),
  ('f0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','otto@test.local','{"full_name":"Otto"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'f0000000-%';
insert into public.user_roles (user_id, role_key) values
  ('f0000000-0000-4000-8000-000000000001','project_manager'),
  ('f0000000-0000-4000-8000-000000000002','member'),
  ('f0000000-0000-4000-8000-000000000003','member');

insert into public.projects (id, name, pm_id, budget_type) values
  ('f2000000-0000-4000-8000-000000000001','V1','f0000000-0000-4000-8000-000000000001','fixed');

-- credential secret goes into Vault; table stores only the reference
select vault.create_secret('super-secret-password', 'v1-db-password', 'test secret');
insert into public.credentials (id, project_id, name, type, username, secret_id, environment, visibility)
values ('f3000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','V1 DB','db_login','app_user',
        (select id from vault.secrets where name = 'v1-db-password'), 'prod', 'project_members');

-- delegation: Vera -> Sam on V1, active window, delegatable perms only
insert into public.delegations (id, from_user, to_user, starts_at, ends_at, handover_notes) values
  ('f4000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000002',
   now() - interval '1 day', now() + interval '13 days', 'Deploys on Friday; client call Tuesdays');
insert into public.delegation_permissions (delegation_id, project_id, permission_key) values
  ('f4000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','view_project'),
  ('f4000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','edit_status'),
  ('f4000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','view_links'),
  ('f4000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','view_credentials');

-- non-delegatable permission is rejected by trigger
select throws_ok(
  $$ insert into public.delegation_permissions (delegation_id, project_id, permission_key)
     values ('f4000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','view_budget') $$,
  'P0001', 'permission is not delegatable', 'budgets cannot be delegated');

-- Sam (stand-in): sees V1 + its credentials metadata during the window
select is(public.has_permission('f0000000-0000-4000-8000-000000000002','view_project','f2000000-0000-4000-8000-000000000001'), true, 'delegation grants view_project');
select is(public.has_permission('f0000000-0000-4000-8000-000000000002','edit_status','f2000000-0000-4000-8000-000000000001'), true, 'delegation grants edit_status');
select is(public.has_permission('f0000000-0000-4000-8000-000000000002','view_budget','f2000000-0000-4000-8000-000000000001'), false, 'delegation never grants budgets');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.credentials where project_id = 'f2000000-0000-4000-8000-000000000001'), 1, 'stand-in sees credential metadata');
select is((select count(*)::int from information_schema.columns where table_schema='public' and table_name='credentials' and column_name in ('secret','secret_value','password')), 0, 'no raw secret column exists');

-- Otto (unrelated): nothing
set local "request.jwt.claims" to '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.credentials), 0, 'outsider sees no credentials');
select is((select count(*)::int from public.delegations), 0, 'outsider sees no delegations');

-- INSERT policy: manage_delegations is scoped own_projects, so creating a delegation shell
-- requires holding it on an owned project; the trigger still confines actual delegated
-- projects to ones the delegator owns.
set local "request.jwt.claims" to '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ insert into public.delegations (from_user, to_user, starts_at, ends_at)
     values (auth.uid(), 'f0000000-0000-4000-8000-000000000003', now(), now() + interval '5 days') $$,
  'PM can create a delegation');

set local "request.jwt.claims" to '{"sub":"f0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ insert into public.delegations (from_user, to_user, starts_at, ends_at)
     values (auth.uid(), 'f0000000-0000-4000-8000-000000000003', now(), now() + interval '5 days') $$,
  '42501', null, 'non-PM cannot create delegations');

set local "request.jwt.claims" to '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ insert into public.delegations (from_user, to_user, starts_at, ends_at)
     values ('f0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000003', now(), now() + interval '5 days') $$,
  '42501', null, 'cannot create delegations on behalf of others');

-- revoke ends access immediately
reset role;
update public.delegations set revoked_at = now(), revoked_by = 'f0000000-0000-4000-8000-000000000001'
  where id = 'f4000000-0000-4000-8000-000000000001';
select is(public.has_permission('f0000000-0000-4000-8000-000000000002','view_project','f2000000-0000-4000-8000-000000000001'), false, 'revoked delegation grants nothing');

-- expired window grants nothing (fresh delegation entirely in the past)
insert into public.delegations (id, from_user, to_user, starts_at, ends_at) values
  ('f4000000-0000-4000-8000-000000000002','f0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000002', now() - interval '30 days', now() - interval '16 days');
insert into public.delegation_permissions (delegation_id, project_id, permission_key) values
  ('f4000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','view_project');
select is(public.has_permission('f0000000-0000-4000-8000-000000000002','view_project','f2000000-0000-4000-8000-000000000001'), false, 'expired delegation grants nothing');

select * from finish();
rollback;
