begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- fixtures: an admin (the only role that can legitimately reach the "managers insert project
-- grants" RLS policy without already holding a project grant) and a non-admin member who is the
-- would-be escalation target.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('f9000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','g6admin@test.local','{"full_name":"G6 Admin"}','{}','',now(),now()),
  ('f9000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','g6mem@test.local','{"full_name":"G6 Member"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'f9000000-%';
insert into public.user_roles (user_id, role_key) values
  ('f9000000-0000-4000-8000-000000000001','admin'),
  ('f9000000-0000-4000-8000-000000000002','member');

insert into public.projects (id, name, budget_type) values
  ('fa000000-0000-4000-8000-000000000001','G6 Grantable Project','fixed');

-- 1/2: the trigger fires for ANY caller, not just the app action -- proven here as a bare
-- superuser insert (bypassing RLS entirely), which is exactly the "forced RLS insert" scenario
-- the brief calls out (service_role, a psql session, a future code path that skips the app layer).
select throws_ok(
  $$ insert into public.user_project_permissions (user_id, project_id, permission_key)
     values ('f9000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000001','manage_access') $$,
  'P0001', 'permission manage_access is not grantable per-project',
  'manage_access cannot be inserted into user_project_permissions, even as superuser');

select throws_ok(
  $$ insert into public.user_project_permissions (user_id, project_id, permission_key)
     values ('f9000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000001','view_audit') $$,
  'P0001', 'permission view_audit is not grantable per-project',
  'view_audit cannot be inserted into user_project_permissions, even as superuser');

-- 3: an ordinary, legitimately grantable per-project permission still works.
select lives_ok(
  $$ insert into public.user_project_permissions (user_id, project_id, permission_key)
     values ('f9000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000001','view_budget') $$,
  'view_budget (grantable) can still be inserted into user_project_permissions');

-- 4: the escalation itself, end-to-end through RLS -- an admin (who legitimately passes the
-- "managers insert project grants" policy via has_permission's is_admin bypass) tries to grant a
-- non-admin member project-scoped manage_access through the exact path the access screen uses.
-- Before this fix, this insert would have succeeded and the member would have become
-- admin-equivalent on this project. The trigger now blocks it regardless of the RLS outcome.
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"f9000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ insert into public.user_project_permissions (user_id, project_id, permission_key)
     values ('f9000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000001','manage_access') $$,
  'P0001', 'permission manage_access is not grantable per-project',
  'admin cannot grant manage_access to a non-admin via the access screen''s own RLS path -- escalation closed');

-- 5: the same admin, same RLS path, granting a legitimate permission -- proves the fix is
-- targeted (grantable permissions are unaffected), not a blanket lockdown of the feature.
select lives_ok(
  $$ insert into public.user_project_permissions (user_id, project_id, permission_key)
     values ('f9000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000001','manage_project_members') $$,
  'admin can still grant an ordinary permission to a non-admin via the access screen''s RLS path');
reset role;

-- 6: the escalation is closed for good -- after all of the above, the member holds zero
-- manage_access-family grants on this project, proving no code path in this test let one through.
select is(
  (select count(*)::int from public.user_project_permissions
     where user_id = 'f9000000-0000-4000-8000-000000000002'
       and project_id = 'fa000000-0000-4000-8000-000000000001'
       and permission_key in ('manage_access','view_audit')),
  0,
  'non-admin holds no manage_access/view_audit grant on the project after every attempt above');

select * from finish();
rollback;
