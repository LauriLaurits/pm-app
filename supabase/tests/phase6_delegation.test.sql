begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Phase 6 fix: create_delegation(...) must be ATOMIC -- a header row in `delegations` must never
-- commit without its `delegation_permissions` rows. Before this fix, createDelegationAction did a
-- two-step insert (header, then permissions) and manually deleted the header when a trigger
-- rejected a permission row; that delete silently no-op'd (no "delete own delegation" RLS policy
-- exists, only admin-only delete), leaving a permanent, permission-less phantom delegation behind.
--
-- fixtures: PM Priya owns P1 (and holds manage_delegations via project_manager/own_projects).
-- P2 is owned by a different PM (Fred) -- foreign to Priya, used to trigger
-- validate_delegation_project's rejection. Deputy Deb is a plain member, the delegate.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('fa000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','priya-dg@test.local','{"full_name":"Priya"}','{}','',now(),now()),
  ('fa000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fred-dg@test.local','{"full_name":"Fred"}','{}','',now(),now()),
  ('fa000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','deb-dg@test.local','{"full_name":"Deb"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'fa000000-%';
insert into public.user_roles (user_id, role_key) values
  ('fa000000-0000-4000-8000-000000000001','project_manager'),
  ('fa000000-0000-4000-8000-000000000002','project_manager'),
  ('fa000000-0000-4000-8000-000000000003','member');

insert into public.projects (id, name, pm_id, budget_type) values
  ('fb000000-0000-4000-8000-000000000001','P1 (Priya''s)','fa000000-0000-4000-8000-000000000001','fixed'),
  ('fb000000-0000-4000-8000-000000000002','P2 (Fred''s)','fa000000-0000-4000-8000-000000000002','fixed');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"fa000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- ---------- happy path: valid create inserts one header + expected N permission rows ----------
-- 1 project x 2 delegatable permissions (view_project, view_team) = 2 permission rows.
select isnt(
  (select public.create_delegation(
    'fa000000-0000-4000-8000-000000000003',
    array['fb000000-0000-4000-8000-000000000001']::uuid[],
    array['view_project','view_team']::text[],
    now(), now() + interval '5 days', 'covering while I''m out')),
  null,
  'happy path: create_delegation returns a new delegation id');

select is(
  (select count(*)::int from public.delegations where from_user = 'fa000000-0000-4000-8000-000000000001'),
  1,
  'happy path: exactly one delegation header exists');
select is(
  (select count(*)::int from public.delegation_permissions dp
     join public.delegations d on d.id = dp.delegation_id
     where d.from_user = 'fa000000-0000-4000-8000-000000000001'),
  2,
  'happy path: exactly the expected 2 permission rows exist (1 project x 2 permissions)');

-- ---------- atomicity: foreign project rejection leaves ZERO new delegation rows ----------
select is(
  (select count(*)::int from public.delegations),
  1,
  'baseline before the foreign-project attempt: only the happy-path header exists');

select throws_ok(
  $$ select public.create_delegation(
       'fa000000-0000-4000-8000-000000000003',
       array['fb000000-0000-4000-8000-000000000002']::uuid[], -- Fred's project, not Priya's
       array['view_project']::text[],
       now(), now() + interval '5 days', null) $$,
  'P0001', 'can only delegate own projects',
  'atomicity: create_delegation on a foreign project raises');

select is(
  (select count(*)::int from public.delegations),
  1,
  'atomicity: foreign-project rejection left the delegations count unchanged (no orphan header)');

-- ---------- atomicity: non-delegatable permission rejection leaves ZERO new delegation rows ----------
select throws_ok(
  $$ select public.create_delegation(
       'fa000000-0000-4000-8000-000000000003',
       array['fb000000-0000-4000-8000-000000000001']::uuid[], -- Priya's own project (valid)
       array['view_budget']::text[], -- not delegatable
       now(), now() + interval '5 days', null) $$,
  'P0001', 'permission is not delegatable',
  'atomicity: create_delegation with a non-delegatable permission raises');

select is(
  (select count(*)::int from public.delegations),
  1,
  'atomicity: non-delegatable-permission rejection left the delegations count unchanged (no orphan header)');

reset role;

-- anon must never be able to even attempt this.
select is(
  has_function_privilege('anon', 'public.create_delegation(uuid, uuid[], text[], timestamptz, timestamptz, text)', 'EXECUTE'),
  false,
  'anon cannot execute create_delegation');

select * from finish();
rollback;
