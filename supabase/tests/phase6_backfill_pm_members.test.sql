begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- fixtures: PM Priya owns two projects -- one where she's already a member (nothing should
-- change/duplicate), one where she isn't (the gap this migration closes). Migrations already
-- ran against an empty projects table by the time this transaction starts, so we re-run the
-- exact backfill statements from 20260716000007_backfill_pm_members.sql here to prove the
-- logic itself is correct and idempotent.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('f0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','priya-bf@test.local','{"full_name":"Priya"}','{}','',now(),now());
update public.user_profiles set status='active' where id = 'f0000000-0000-4000-8000-000000000001';
insert into public.user_roles (user_id, role_key) values ('f0000000-0000-4000-8000-000000000001','project_manager');
insert into public.people (id, user_id, full_name, weekly_capacity_hours) values
  ('f1000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000001','Priya', 40);

insert into public.projects (id, name, pm_id, budget_type) values
  ('f2000000-0000-4000-8000-000000000001','Already a member','f0000000-0000-4000-8000-000000000001','fixed'),
  ('f2000000-0000-4000-8000-000000000002','Missing membership','f0000000-0000-4000-8000-000000000001','hourly');
insert into public.project_members (project_id, user_id, role_on_project) values
  ('f2000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000001','Existing role');
insert into public.assignments (project_id, person_id, role_on_project, allocation_pct, start_date) values
  ('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','Existing role', 50, current_date);

-- run the backfill (mirrors 20260716000007_backfill_pm_members.sql exactly)
insert into public.project_members (project_id, user_id, role_on_project)
select p.id, p.pm_id, 'Project Manager'
from public.projects p
where p.pm_id is not null and p.id::text like 'f2000000-%'
on conflict (project_id, user_id) do nothing;

insert into public.assignments (project_id, person_id, role_on_project, allocation_pct, start_date)
select p.id, pe.id, 'Project Manager', 100, coalesce(p.start_date, current_date)
from public.projects p
join public.people pe on pe.user_id = p.pm_id
where p.pm_id is not null and p.id::text like 'f2000000-%'
  and not exists (
    select 1 from public.assignments a
    where a.project_id = p.id and a.person_id = pe.id
  );

select is(
  (select count(*)::int from public.project_members where project_id = 'f2000000-0000-4000-8000-000000000002' and user_id = 'f0000000-0000-4000-8000-000000000001'),
  1, 'PM backfilled as a member of the project she was missing from');

select is(
  (select role_on_project from public.project_members where project_id = 'f2000000-0000-4000-8000-000000000001' and user_id = 'f0000000-0000-4000-8000-000000000001'),
  'Existing role', 'already-a-member project is untouched (ON CONFLICT DO NOTHING)');

select is(
  (select count(*)::int from public.assignments where project_id = 'f2000000-0000-4000-8000-000000000002' and person_id = 'f1000000-0000-4000-8000-000000000001'),
  1, 'PM backfilled an assignment on the project she was missing one from');

select is(
  (select count(*)::int from public.assignments where project_id = 'f2000000-0000-4000-8000-000000000001' and person_id = 'f1000000-0000-4000-8000-000000000001'),
  1, 'already-assigned project gets no duplicate assignment (NOT EXISTS guard)');

select * from finish();
rollback;
