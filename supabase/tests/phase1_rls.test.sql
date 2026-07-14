begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- Admin user first, promoted BEFORE the pending user signs up,
-- so the pending-user notification trigger sees an active admin.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.local', '{"full_name":"Admin"}', '{}', '', now(), now());

update public.user_profiles
  set role = 'admin', status = 'active'
  where id = '11111111-1111-1111-1111-111111111111';

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at)
values
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pending@test.local', '{"full_name":"Pending"}', '{}', '', now(), now());

select is(
  (select count(*)::int from public.user_profiles),
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

-- ===== as the admin =====
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.user_profiles),
  2,
  'admin sees all profiles'
);

select is(
  (select count(*)::int from public.notifications where user_id = '11111111-1111-1111-1111-111111111111' and type = 'user_pending'),
  1,
  'admin got an in-app notification for the pending signup'
);

select * from finish();
rollback;
