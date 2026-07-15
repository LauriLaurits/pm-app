begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- fixtures: admin, pm, finance, member (auth trigger creates profiles)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('a0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p2admin@test.local','{"full_name":"P2 Admin"}','{}','',now(),now()),
  ('a0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p2pm@test.local','{"full_name":"P2 PM"}','{}','',now(),now()),
  ('a0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p2fin@test.local','{"full_name":"P2 Fin"}','{}','',now(),now()),
  ('a0000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','p2mem@test.local','{"full_name":"P2 Member"}','{}','',now(),now());

update public.user_profiles set status = 'active'
  where id in ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000004');
insert into public.user_roles (user_id, role_key) values
  ('a0000000-0000-4000-8000-000000000001','admin'),
  ('a0000000-0000-4000-8000-000000000002','project_manager'),
  ('a0000000-0000-4000-8000-000000000003','finance'),
  ('a0000000-0000-4000-8000-000000000004','member');

select is(public.is_admin('a0000000-0000-4000-8000-000000000001'), true,  'is_admin true via user_roles');
select is(public.is_admin('a0000000-0000-4000-8000-000000000002'), false, 'PM is not admin');

select is(public.has_permission('a0000000-0000-4000-8000-000000000003','view_internal_cost'), true,  'finance has global view_internal_cost');
select is(public.has_permission('a0000000-0000-4000-8000-000000000002','view_internal_cost'), false, 'PM lacks view_internal_cost');
select is(public.has_permission('a0000000-0000-4000-8000-000000000001','anything_at_all'), true,     'admin bypasses everything');

update public.user_profiles set status = 'disabled' where id = 'a0000000-0000-4000-8000-000000000003';
select is(public.has_permission('a0000000-0000-4000-8000-000000000003','view_internal_cost'), false,
  'disabled user loses role-based permissions');
update public.user_profiles set status = 'active' where id = 'a0000000-0000-4000-8000-000000000003';
select is(public.has_permission('a0000000-0000-4000-8000-000000000003','view_internal_cost'), true,
  're-enabled user regains role-based permissions');

-- explicit per-project grant with expiry (project uuid is synthetic here; FK to projects comes in Task 3, so this table starts without the FK — see migration note)
insert into public.user_project_permissions (user_id, project_id, permission_key, expires_at) values
  ('a0000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000099','view_budget', now() + interval '1 day'),
  ('a0000000-0000-4000-8000-000000000004','b0000000-0000-4000-8000-000000000098','view_budget', now() - interval '1 day');

select is(public.has_permission('a0000000-0000-4000-8000-000000000004','view_budget','b0000000-0000-4000-8000-000000000099'), true,  'unexpired explicit grant works');
select is(public.has_permission('a0000000-0000-4000-8000-000000000004','view_budget','b0000000-0000-4000-8000-000000000098'), false, 'expired explicit grant denied');

-- RLS: non-admin cannot grant roles
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok(
  $$ insert into public.user_roles (user_id, role_key) values ('a0000000-0000-4000-8000-000000000004','admin') $$,
  '42501', null, 'member cannot self-grant a role');
select is((select count(*)::int from public.user_roles where user_id = 'a0000000-0000-4000-8000-000000000004'), 1,
  'user can read own role');
select is((select count(*)::int from public.role_permissions where role_key = 'finance' and permission_key = 'view_internal_cost' and scope = 'global'), 1,
  'permission matrix readable by authenticated');

select * from finish();
rollback;
