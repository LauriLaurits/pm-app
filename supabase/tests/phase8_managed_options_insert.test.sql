begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('a0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pm@test.local','{"full_name":"PM"}','{}','',now(),now()),
  ('a0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mem@test.local','{"full_name":"Mem"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'a0000000-%';
insert into public.user_roles (user_id, role_key) values
  ('a0000000-0000-4000-8000-000000000001','project_manager'),
  ('a0000000-0000-4000-8000-000000000002','member');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ insert into public.managed_options (kind, value) values ('role_title', 'Growth Designer') $$,
  'manage_people holder (PM) can insert a managed option');

-- PM is NOT admin: the admin-only write policy must not let them delete. RLS delete without a
-- matching policy silently affects 0 rows, so assert the row survives.
select lives_ok(
  $$ delete from public.managed_options where kind = 'role_title' and value = 'Growth Designer' $$,
  'PM delete attempt does not error');
select is(
  (select count(*)::int from public.managed_options where kind = 'role_title' and value = 'Growth Designer'),
  1,
  'row survives a non-admin delete attempt (delete stays admin-only)');

set local "request.jwt.claims" to '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ insert into public.managed_options (kind, value) values ('team', 'Rogue Team') $$,
  '42501', null,
  'plain member still cannot insert a managed option');

select * from finish();
rollback;
