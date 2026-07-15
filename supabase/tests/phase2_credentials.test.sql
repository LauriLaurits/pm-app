begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

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

-- explicit credential_access grant: Otto has no project relation and no other visibility
-- path, so credential_access is the only thing that could show him the V1 credential.
reset role;
insert into public.credential_access (credential_id, user_id, granted_by, expires_at) values
  ('f3000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000003','f0000000-0000-4000-8000-000000000001',
   now() + interval '1 day');
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.credentials where id = 'f3000000-0000-4000-8000-000000000001'), 1,
  'explicit credential_access grants visibility');

reset role;
update public.credential_access set expires_at = now() - interval '1 day'
  where credential_id = 'f3000000-0000-4000-8000-000000000001' and user_id = 'f0000000-0000-4000-8000-000000000003';
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"f0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.credentials where id = 'f3000000-0000-4000-8000-000000000001'), 0,
  'expired credential_access grant denies visibility');

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

-- admins_only visibility must also gate the write policies (Fix 2), not just SELECT: a PM's
-- manage_credentials own_projects must not let them read/write an admins_only credential.
reset role;
update public.credentials set visibility = 'admins_only' where id = 'f3000000-0000-4000-8000-000000000001';
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.credentials where id = 'f3000000-0000-4000-8000-000000000001'), 0,
  'PM cannot see admins_only credential');
-- Note: RLS USING-clause failures on UPDATE/DELETE silently exclude the row (0 rows affected)
-- rather than raising an error - an error only fires when USING passes on the OLD row but
-- WITH CHECK then rejects the NEW row. Since VG is identical in USING and WITH CHECK here and
-- visibility isn't changing, the row never becomes visible to Vera's UPDATE, so the correct,
-- observable assertion is "the name did not change", not a thrown exception.
update public.credentials set name = 'renamed-by-pm' where id = 'f3000000-0000-4000-8000-000000000001';
reset role;
select isnt((select name from public.credentials where id = 'f3000000-0000-4000-8000-000000000001'), 'renamed-by-pm',
  'PM cannot manage admins_only credential');
update public.credentials set visibility = 'project_members' where id = 'f3000000-0000-4000-8000-000000000001';

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

-- delegation immutability (Fix 3): an active delegation may only ever be updated to set
-- revoked_at/revoked_by, one-way; the trigger enforces this regardless of the RLS row-access
-- gate (which still passes here, since Vera is from_user).
insert into public.delegations (id, from_user, to_user, starts_at, ends_at) values
  ('f4000000-0000-4000-8000-000000000003','f0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000002',
   now() - interval '1 hour', now() + interval '10 days');
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ update public.delegations set ends_at = ends_at + interval '30 days' where id = 'f4000000-0000-4000-8000-000000000003' $$,
  'P0001', 'only revoked_at/revoked_by may be updated on a delegation', 'cannot rewrite delegation window');
select lives_ok(
  $$ update public.delegations set revoked_at = now(), revoked_by = auth.uid() where id = 'f4000000-0000-4000-8000-000000000003' $$,
  'delegator can revoke own delegation');
select throws_ok(
  $$ update public.delegations set revoked_at = null where id = 'f4000000-0000-4000-8000-000000000003' $$,
  'P0001', 'a revoked delegation is immutable', 'cannot un-revoke a delegation');
reset role;

select * from finish();
rollback;
