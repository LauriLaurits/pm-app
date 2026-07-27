begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- User decision (2026-07-27): status updates are no longer immutable -- the author may edit
-- or delete their own update. Admin delete already covered by phase2_projects.test.sql; here
-- we cover author edit, author delete, and a non-author's delete attempt being a no-op.
--
-- 20260727000005 tightened the update grant to the six content columns only (revoking the
-- table-wide grant 0004 left in place), after review found an author could otherwise PATCH
-- project_id (move a row into a project they don't own -- cross-project content injection)
-- or created_at (silently reorder/backdate history) via PostgREST. Those two attempts are
-- covered below as column-privilege rejections.

-- fixtures: PM author, second PM (non-author), member (no edit_status)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('d0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pma@test.local','{"full_name":"PM Author"}','{}','',now(),now()),
  ('d0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pmb@test.local','{"full_name":"PM Other"}','{}','',now(),now()),
  ('d0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','memc@test.local','{"full_name":"Member"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'd0000000-%';
insert into public.user_roles (user_id, role_key) values
  ('d0000000-0000-4000-8000-000000000001','project_manager'),
  ('d0000000-0000-4000-8000-000000000002','project_manager'),
  ('d0000000-0000-4000-8000-000000000003','member');

insert into public.clients (id, name) values ('d1000000-0000-4000-8000-000000000001','Client D');
insert into public.projects (id, name, client_id, pm_id, status, health, budget_type) values
  ('d2000000-0000-4000-8000-000000000001','D1','d1000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','active','healthy','fixed'),
  ('d2000000-0000-4000-8000-000000000002','D2','d1000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','active','healthy','fixed');
insert into public.project_members (project_id, user_id, role_on_project) values
  ('d2000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003','developer');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.project_status_updates (project_id, author_id, completed, in_progress)
  values ('d2000000-0000-4000-8000-000000000001', auth.uid(), 'edit-me', 'UI ongoing');

select lives_ok(
  $$ update public.project_status_updates set completed = 'edit-me (typo fixed)' where completed = 'edit-me' $$,
  'author can update own status update');

-- Cross-project injection: the author owns this row but does NOT own/have edit_status on the
-- second project. Column-privilege revocation (project_id isn't in the granted column set)
-- must reject this outright -- 42501 -- rather than letting it through as an RLS no-op.
select throws_ok(
  $$ update public.project_status_updates set project_id = 'd2000000-0000-4000-8000-000000000002' where completed = 'edit-me (typo fixed)' $$,
  '42501',
  'permission denied for table project_status_updates',
  'author cannot repoint their own update to another project (column privilege)');

-- History backdating: created_at also isn't in the granted column set.
select throws_ok(
  $$ update public.project_status_updates set created_at = now() - interval '1 day' where completed = 'edit-me (typo fixed)' $$,
  '42501',
  'permission denied for table project_status_updates',
  'author cannot rewrite created_at on their own update (column privilege)');

-- second PM (non-author, no membership/ownership on this project) attempts to edit: RLS
-- filters the row so the update "succeeds" with 0 rows affected, no error.
set local "request.jwt.claims" to '{"sub":"d0000000-0000-4000-8000-000000000002","role":"authenticated"}';
with u as (
  update public.project_status_updates set completed = 'rewritten history'
    where completed = 'edit-me (typo fixed)' returning id
)
select is((select count(*)::int from u), 0, 'non-author update affects 0 rows');

set local "request.jwt.claims" to '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ delete from public.project_status_updates where completed = 'edit-me (typo fixed)' $$,
  'author can delete own status update');

-- member (not the author) attempts to delete someone else's row: no matching delete policy,
-- so the delete is a silent no-op (row stays in place) rather than an error.
insert into public.project_status_updates (project_id, author_id, completed, in_progress)
  values ('d2000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'delete-target', 'UI ongoing');
set local "request.jwt.claims" to '{"sub":"d0000000-0000-4000-8000-000000000003","role":"authenticated"}';
with d as (
  delete from public.project_status_updates where completed = 'delete-target' returning id
)
select is((select count(*)::int from d), 0, 'member delete of someone else''s update leaves it in place');

select * from finish();
rollback;
