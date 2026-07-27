begin;
create extension if not exists pgtap with schema extensions;
select plan(4);
-- 1 current vacation exposes its end date, 2 overlapping vacations expose the LATEST end,
-- 3 no vacation -> null, 4 on_vacation_now still true for a covered person

-- fixture: one member viewer + three people (no auth linkage needed on the people rows)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('f0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','viewer@test.local','{"full_name":"Viewer"}','{}','',now(),now());
update public.user_profiles set status='active' where id = 'f0000000-0000-4000-8000-000000000001';
insert into public.user_roles (user_id, role_key) values
  ('f0000000-0000-4000-8000-000000000001','member');

insert into public.people (id, full_name, weekly_capacity_hours) values
  ('f4000000-0000-4000-8000-000000000001','Vac Single', 40),
  ('f4000000-0000-4000-8000-000000000002','Vac Overlap', 40),
  ('f4000000-0000-4000-8000-000000000003','Vac None', 40);

insert into public.time_off (person_id, starts_on, ends_on, type) values
  ('f4000000-0000-4000-8000-000000000001', current_date - 2, current_date + 5, 'vacation'),
  ('f4000000-0000-4000-8000-000000000002', current_date - 3, current_date + 3, 'vacation'),
  ('f4000000-0000-4000-8000-000000000002', current_date - 1, current_date + 10, 'vacation');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"f0000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select vacation_ends_on from public.person_workload_rows where id = 'f4000000-0000-4000-8000-000000000001'),
  current_date + 5,
  'single current vacation: vacation_ends_on = its ends_on');
select is(
  (select vacation_ends_on from public.person_workload_rows where id = 'f4000000-0000-4000-8000-000000000002'),
  current_date + 10,
  'overlapping vacations: vacation_ends_on = max(ends_on)');
select is(
  (select vacation_ends_on from public.person_workload_rows where id = 'f4000000-0000-4000-8000-000000000003'),
  null,
  'no vacation today: vacation_ends_on is null');
select is(
  (select on_vacation_now from public.person_workload_rows where id = 'f4000000-0000-4000-8000-000000000001'),
  true,
  'on_vacation_now still true for a covered person');

select * from finish();
rollback;
