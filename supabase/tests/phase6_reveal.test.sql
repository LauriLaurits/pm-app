begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- fixtures: PM Priya (owns P1, holds reveal_credential via project_manager/own_projects),
-- member Milo-alike Nils (project_members on P1, only member_projects-scoped perms -- no
-- view_credentials, no reveal_credential), outsider Otto (no relation to P1 at all).
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('f6000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','priya-rv@test.local','{"full_name":"Priya"}','{}','',now(),now()),
  ('f6000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','nils-rv@test.local','{"full_name":"Nils"}','{}','',now(),now()),
  ('f6000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','otto-rv@test.local','{"full_name":"Otto"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'f6000000-%';
insert into public.user_roles (user_id, role_key) values
  ('f6000000-0000-4000-8000-000000000001','project_manager'),
  ('f6000000-0000-4000-8000-000000000002','member'),
  ('f6000000-0000-4000-8000-000000000003','member');

insert into public.projects (id, name, pm_id, budget_type) values
  ('f7000000-0000-4000-8000-000000000001','P1','f6000000-0000-4000-8000-000000000001','fixed');
insert into public.project_members (project_id, user_id, role_on_project) values
  ('f7000000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000002','engineer');

-- credential secret goes into Vault; table stores only the reference. Known plaintext so the
-- RPC's return value can be asserted exactly, same as the seed's 'St4g1ng-Pw!' pattern.
select vault.create_secret('r3veal-M3-plz!', 'p1-reveal-test-secret', 'test secret');
insert into public.credentials (id, project_id, name, type, username, secret_id, environment, visibility)
values ('f8000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001','P1 DB','db_login','app_user',
        (select id from vault.secrets where name = 'p1-reveal-test-secret'), 'prod', 'project_members');

-- PM Priya holds reveal_credential (project_manager, own_projects) on P1: the RPC hands back
-- exactly the seeded plaintext, proving both the permission gate passes AND the vault decrypt
-- round-trips correctly.
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"f6000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  public.reveal_credential_secret('f8000000-0000-4000-8000-000000000001'),
  'r3veal-M3-plz!',
  'reveal_credential holder gets back the exact seeded plaintext');
reset role;

-- Nils (plain member, sees P1 via project_members but has neither view_credentials nor
-- reveal_credential -- 'member' role grants view_project/view_team/view_links/view_people/
-- log_time only, see 20260715000002_permission_model.sql) is rejected by the in-body
-- has_permission check.
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"f6000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.reveal_credential_secret('f8000000-0000-4000-8000-000000000001') $$,
  'P0001', 'not permitted', 'member without reveal_credential cannot reveal');
reset role;

-- Otto (no relation to P1 whatsoever) gets the identical rejection -- same error, no
-- existence-vs-permission distinction leaked.
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"f6000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$ select public.reveal_credential_secret('f8000000-0000-4000-8000-000000000001') $$,
  'P0001', 'not permitted', 'unrelated outsider cannot reveal');
reset role;

-- bonus: anon has no execute privilege on the function at all (defense in depth beyond the
-- in-body permission check -- an anon caller cannot even attempt the RPC).
select is(
  has_function_privilege('anon', 'public.reveal_credential_secret(uuid)', 'EXECUTE'),
  false,
  'anon cannot execute reveal_credential_secret');

select * from finish();
rollback;
