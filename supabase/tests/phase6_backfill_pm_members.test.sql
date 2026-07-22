begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

-- fixtures: PM Priya owns two projects -- one where she's already a member (nothing should
-- change/duplicate), one where she isn't (the gap this migration closes). Migrations already
-- ran against an empty projects table by the time this transaction starts, so we re-run the
-- backfill statement from 20260716000007_backfill_pm_members.sql here (in its post-member-
-- periods NOT EXISTS form, see below) to prove the logic itself is correct and idempotent. No `assignments` backfill is exercised here: that
-- statement was removed from the migration (a synthetic 100%-allocation row per PM-owned
-- project inflated workload allocation); project_members alone is now sufficient since
-- "log own time" accepts membership OR assignment.
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

-- run the backfill. 20260716000007_backfill_pm_members.sql used ON CONFLICT (project_id,
-- user_id) DO NOTHING, which was valid when it ran (migration order) but stopped being
-- runnable once 20260722000001_member_periods.sql dropped that unique constraint -- so this
-- re-run uses the equivalent WHERE NOT EXISTS form (the same form seed.sql now uses).
insert into public.project_members (project_id, user_id, role_on_project)
select p.id, p.pm_id, 'Project Manager'
from public.projects p
where p.pm_id is not null and p.id::text like 'f2000000-%'
  and not exists (
    select 1 from public.project_members m
    where m.project_id = p.id and m.user_id = p.pm_id);

select is(
  (select count(*)::int from public.project_members where project_id = 'f2000000-0000-4000-8000-000000000002' and user_id = 'f0000000-0000-4000-8000-000000000001'),
  1, 'PM backfilled as a member of the project she was missing from');

select is(
  (select role_on_project from public.project_members where project_id = 'f2000000-0000-4000-8000-000000000001' and user_id = 'f0000000-0000-4000-8000-000000000001'),
  'Existing role', 'already-a-member project is untouched (NOT EXISTS guard)');

select * from finish();
rollback;
