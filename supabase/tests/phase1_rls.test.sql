begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- Admin user first, promoted BEFORE the pending user signs up,
-- so the pending-user notification trigger sees an active admin.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.local', '{"full_name":"Admin"}', '{}', '', now(), now());

update public.user_profiles set status = 'active' where id = '11111111-1111-1111-1111-111111111111';
insert into public.user_roles (user_id, role_key) values ('11111111-1111-1111-1111-111111111111','admin');

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at)
values
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pending@test.local', '{"full_name":"Pending"}', '{}', '', now(), now());

select is(
  (select count(*)::int from public.user_profiles
   where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')),
  2,
  'trigger creates a profile per auth user'
);

-- ===== as the pending user =====
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.user_profiles),
  1,
  'non-admin sees only own profile'
);

select throws_ok(
  $$ update public.user_profiles set status = 'active'
     where id = '22222222-2222-2222-2222-222222222222' $$,
  'P0001',
  'not allowed to change protected profile fields',
  'non-admin cannot self-approve'
);

select throws_ok(
  $$ update public.user_profiles set email = 'fake@corp.com'
     where id = '22222222-2222-2222-2222-222222222222' $$,
  'P0001',
  'not allowed to change protected profile fields',
  'non-admin cannot change own email (identity anchor protected)'
);

select lives_ok(
  $$ update public.user_profiles set full_name = 'New Name'
     where id = '22222222-2222-2222-2222-222222222222' $$,
  'non-admin can still self-edit full_name'
);

select is(
  (select count(*)::int from public.audit_logs),
  0,
  'non-admin cannot read audit logs'
);

select throws_ok(
  $$ delete from public.audit_logs $$,
  '42501',
  null,
  'audit_logs delete privilege revoked (append-only)'
);

select throws_ok(
  $$ insert into public.audit_logs (action) values ('x') $$,
  '42501',
  null,
  'audit_logs insert privilege revoked (append-only, service_role writes only)'
);

-- ===== as the admin =====
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.user_profiles
   where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')),
  2,
  'admin sees all profiles (both fixtures, including the non-own one)'
);

select is(
  (select count(*)::int from public.notifications where user_id = '11111111-1111-1111-1111-111111111111' and type = 'user_pending'),
  1,
  'admin got an in-app notification for the pending signup'
);

-- notifications are read-receipt only: column-scoped grant lets the owner
-- flip read_at but not rewrite title/body/type/metadata.
select throws_ok(
  $$ update public.notifications set title = 'hacked'
     where user_id = '11111111-1111-1111-1111-111111111111' and type = 'user_pending' $$,
  '42501',
  null,
  'notifications: column-scoped grant blocks title updates'
);

select lives_ok(
  $$ update public.notifications set read_at = now()
     where user_id = '11111111-1111-1111-1111-111111111111' and type = 'user_pending' $$,
  'notifications: read_at update allowed (read-receipt)'
);

-- ===== session management RPCs over auth.sessions =====

reset role;
insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', now(), now());

-- ===== as the pending user =====
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.list_my_sessions()),
  1,
  'list_my_sessions returns only own session'
);

select is(
  (select public.revoke_session('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')),
  false,
  'cross-user session revoke returns false (no-op)'
);

reset role;
select is(
  (select count(*)::int from auth.sessions where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  'cross-user session revoke is a no-op: admin session survives'
);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select throws_ok(
  $$ select public.admin_revoke_user_sessions('11111111-1111-1111-1111-111111111111') $$,
  'P0001',
  'admin permission required',
  'non-admin cannot use admin_revoke_user_sessions'
);

select is(
  (select public.revoke_session('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')),
  true,
  'own session revoke returns true'
);

reset role;
select is(
  (select count(*)::int from auth.sessions where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  0,
  'own session revoke deletes the row'
);

-- re-insert a session for the pending user so the admin's bulk revoke has
-- something to delete
insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', now(), now());

-- ===== as the admin =====
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select public.admin_revoke_user_sessions('22222222-2222-2222-2222-222222222222')),
  1,
  'admin bulk revoke returns count of deleted sessions'
);

reset role;
select is(
  (select count(*)::int from auth.sessions where user_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'admin bulk revoke actually deletes the target user''s sessions'
);

select * from finish();
rollback;
