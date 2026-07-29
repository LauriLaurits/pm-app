begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

-- Phase 9: security invariants (audit 2026-07-29, fixes H2/H3/H5/H6/M5 in
-- 20260729000001_security_hardening.sql). These assertions encode the hardened state as
-- DB invariants so none of it can silently rot:
--   INV1  RLS enabled on every public table
--   INV2  security_invoker on every public view
--   INV3  EXECUTE lockdown on definer functions (anon/authenticated bypass paths)
--   INV4  credential reveal + role change write a DB-level audit row (not just app-layer)
--   INV5  budget_items.item_type is not updatable (cost-tier re-typing blocked)  [H2]
--   INV6  credentials.owner_id pinned on insert, immutable on update             [H6]
--   INV7  allocation definer RPCs return zeros to a no-view_people caller        [H5]
--   INV8  has_permission/has_credential_access refuse foreign-uid probes         [H5]

-- ---------- fixtures ----------
-- adm (admin), pam (PM, owns P1), pat (PM, no projects), vic (viewer: ZERO role perms),
-- mel (member: has global view_people).
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('a9000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','adm-inv@test.local','{"full_name":"Adm"}','{}','',now(),now()),
  ('a9000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pam-inv@test.local','{"full_name":"Pam"}','{}','',now(),now()),
  ('a9000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pat-inv@test.local','{"full_name":"Pat"}','{}','',now(),now()),
  ('a9000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','vic-inv@test.local','{"full_name":"Vic"}','{}','',now(),now()),
  ('a9000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mel-inv@test.local','{"full_name":"Mel"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'a9000000-%';
insert into public.user_roles (user_id, role_key) values
  ('a9000000-0000-4000-8000-000000000001','admin'),
  ('a9000000-0000-4000-8000-000000000002','project_manager'),
  ('a9000000-0000-4000-8000-000000000003','project_manager'),
  ('a9000000-0000-4000-8000-000000000004','viewer'),
  ('a9000000-0000-4000-8000-000000000005','member');

insert into public.projects (id, name, pm_id, budget_type) values
  ('a9100000-0000-4000-8000-000000000001','INV P1','a9000000-0000-4000-8000-000000000002','fixed');

insert into public.people (id, user_id, full_name, weekly_capacity_hours) values
  ('a9200000-0000-4000-8000-000000000001', null, 'Inv Worker', 40);
insert into public.assignments (project_id, project_part_id, person_id, allocation_pct, start_date, end_date) values
  ('a9100000-0000-4000-8000-000000000001', null, 'a9200000-0000-4000-8000-000000000001', 70, current_date - 10, current_date + 30);

insert into public.budgets (id, project_id, currency) values
  ('a9300000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000001','EUR');
-- one client-facing item (PM-visible/editable) and one internal-cost item (hidden from PM pam,
-- who holds manage_budget own_projects but NOT view_internal_cost)
insert into public.budget_items (budget_id, item_type, name, amount, occurred_on, created_by) values
  ('a9300000-0000-4000-8000-000000000001','invoice','Client invoice', 1000, current_date - 5, 'a9000000-0000-4000-8000-000000000002'),
  ('a9300000-0000-4000-8000-000000000001','planned_cost','Hidden cost', 500, current_date - 5, null);

-- credential with a known plaintext (Vault-backed) + an explicit access grant for mel
select vault.create_secret('inv-s3cret-Xy!', 'invariant-test-secret', 'test secret');
insert into public.credentials (id, project_id, name, type, username, secret_id, environment, visibility)
values ('a9400000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000001','INV DB','db_login','app',
        (select id from vault.secrets where name = 'invariant-test-secret'), 'prod', 'project_members');
insert into public.credential_access (credential_id, user_id, granted_by) values
  ('a9400000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000005','a9000000-0000-4000-8000-000000000001');

-- ---------- INV1: RLS enabled on every public table ----------
select is_empty(
  $$ select c.relname::text from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity $$,
  'INV1: every table in public has row level security enabled');

-- ---------- INV2: security_invoker on every public view ----------
select is_empty(
  $$ select c.relname::text from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
       and not (coalesce(c.reloptions, '{}'::text[])
                && array['security_invoker=true','security_invoker=on']) $$,
  'INV2: every view in public is security_invoker (inherits caller RLS)');

-- ---------- INV3: EXECUTE lockdown on definer bypass paths ----------
select is(has_function_privilege('anon', 'public.is_admin(uuid)', 'EXECUTE'),
  false, 'INV3: anon cannot execute is_admin(uuid) (no admin-existence oracle)');
select is(has_function_privilege('anon', 'public.pm_options()', 'EXECUTE'),
  false, 'INV3: anon cannot execute pm_options()');
select is(has_function_privilege('anon', 'public.create_credential_secret(text,text,text)', 'EXECUTE'),
  false, 'INV3: anon cannot execute create_credential_secret');
select is(has_function_privilege('authenticated', 'public.create_credential_secret(text,text,text)', 'EXECUTE'),
  false, 'INV3: authenticated cannot execute create_credential_secret (service_role only)');
select is(has_function_privilege('anon', 'public.reveal_credential_secret(uuid)', 'EXECUTE'),
  false, 'INV3: anon cannot execute reveal_credential_secret');
-- load-bearing counter-assertion: RLS policies call has_permission as `authenticated`;
-- that EXECUTE grant must never be revoked.
select is(has_function_privilege('authenticated', 'public.has_permission(uuid,text,uuid)', 'EXECUTE'),
  true, 'INV3: authenticated KEEPS execute on has_permission (every RLS policy depends on it)');

-- ---------- INV4: reveal + role change audit at the DB level ----------
-- pam (reveal_credential via project_manager own_projects on P1) reveals: legit flow intact...
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a9000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select secret from public.reveal_credential_secret('a9400000-0000-4000-8000-000000000001')),
  'inv-s3cret-Xy!',
  'INV4: permission holder still gets the plaintext back from reveal');
reset role;
-- ...and the reveal left a DB-written audit row (would exist even for a direct REST RPC call)
select is(
  (select count(*)::int from public.audit_logs
   where action = 'credential.revealed'
     and resource_id = 'a9400000-0000-4000-8000-000000000001'
     and actor_id = 'a9000000-0000-4000-8000-000000000002'),
  1,
  'INV4: reveal wrote an audit_logs row from inside the definer function');
select is(
  (select count(*)::int from public.audit_logs where metadata::text like '%inv-s3cret-Xy!%'),
  0,
  'INV4: the audit row never contains the secret');
-- role changes audit at the DB level too (set_user_role); no-op swap keeps mel a member
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a9000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select public.set_user_role('a9000000-0000-4000-8000-000000000005', 'member') $$,
  'INV4: admin role swap still works');
reset role;
select is(
  (select count(*)::int from public.audit_logs
   where action = 'user.role_changed'
     and resource_id = 'a9000000-0000-4000-8000-000000000005'
     and actor_id = 'a9000000-0000-4000-8000-000000000001'),
  1,
  'INV4: set_user_role wrote an audit_logs row from inside the definer function');

-- ---------- INV5 (H2): budget cost-tier re-typing blocked ----------
select is(
  has_column_privilege('authenticated', 'public.budget_items', 'item_type', 'UPDATE'),
  false,
  'INV5: authenticated has no UPDATE privilege on budget_items.item_type');
-- pam holds manage_budget (own_projects) but NOT view_internal_cost: re-typing a hidden cost
-- row into a visible type must fail at the column-privilege layer (42501), not silently no-op.
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a9000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ update public.budget_items set item_type = 'invoice' where name = 'Hidden cost' $$,
  '42501', null,
  'INV5: manage_budget-only caller cannot re-type a cost row (H2 bypass closed)');
-- legit manage_budget edit of a client-facing item still works
select lives_ok(
  $$ update public.budget_items set amount = 1100 where name = 'Client invoice' $$,
  'INV5: manage_budget holder still edits non-cost items');
-- and an attempted rewrite of the hidden cost row is filtered by the UPDATE policy (0 rows)
update public.budget_items set amount = 9 where name = 'Hidden cost';
reset role;
select is(
  (select amount from public.budget_items where name = 'Hidden cost'),
  500::numeric,
  'INV5: manage_budget-only caller cannot rewrite a cost row it cannot see');

-- ---------- INV6 (H6): credentials.owner_id pinned / immutable ----------
select is(
  has_column_privilege('authenticated', 'public.credentials', 'owner_id', 'UPDATE'),
  false,
  'INV6: authenticated has no UPDATE privilege on credentials.owner_id');
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a9000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ update public.credentials set owner_id = 'a9000000-0000-4000-8000-000000000005'
     where id = 'a9400000-0000-4000-8000-000000000001' $$,
  '42501', null,
  'INV6: owner_id is immutable on update (no standing-backdoor grant)');
select throws_ok(
  $$ insert into public.credentials (project_id, name, type, secret_id, visibility, owner_id)
     values ('a9100000-0000-4000-8000-000000000001','Spoof-owned','api_key', gen_random_uuid(),
             'project_members','a9000000-0000-4000-8000-000000000005') $$,
  '42501', null,
  'INV6: insert cannot attribute ownership to another user');
select lives_ok(
  $$ insert into public.credentials (project_id, name, type, secret_id, visibility, owner_id)
     values ('a9100000-0000-4000-8000-000000000001','Self-owned','api_key', gen_random_uuid(),
             'project_members', auth.uid()) $$,
  'INV6: insert with owner_id = self still works');
reset role;

-- ---------- INV7 (H5): allocation definer RPCs gated on view_people / self ----------
-- vic (viewer, zero role permissions, no people row) probes a foreign person directly
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"a9000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is(
  (select allocation_pct from public.person_current_allocation('a9200000-0000-4000-8000-000000000001')),
  0::numeric,
  'INV7: no-view_people caller gets 0 allocation for a foreign person');
select is(
  (select project_count from public.person_current_allocation('a9200000-0000-4000-8000-000000000001')),
  0,
  'INV7: no-view_people caller gets 0 project count for a foreign person');
select is(
  (select allocation_pct from public.person_weekly_allocation('a9200000-0000-4000-8000-000000000001', current_date, 1)
   where week_start = date_trunc('week', current_date)::date),
  0::numeric,
  'INV7: no-view_people caller gets 0 weekly allocation for a foreign person');
-- mel (member: view_people global) still gets the TRUE aggregate -- the workload view path
set local "request.jwt.claims" to '{"sub":"a9000000-0000-4000-8000-000000000005","role":"authenticated"}';
select is(
  (select allocation_pct from public.person_current_allocation('a9200000-0000-4000-8000-000000000001')),
  70::numeric,
  'INV7: view_people holder still gets the true allocation (workload view intact)');

-- ---------- INV8 (H5): foreign-uid probes refused ----------
-- vic asks about pam's permissions: refused (pam DOES hold view_project on P1)
set local "request.jwt.claims" to '{"sub":"a9000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is(
  public.has_permission('a9000000-0000-4000-8000-000000000002','view_project','a9100000-0000-4000-8000-000000000001'),
  false,
  'INV8: non-admin probing a foreign uid gets false (authz map sealed)');
select is(
  public.has_permission('a9000000-0000-4000-8000-000000000003','create_project'),
  false,
  'INV8: the create_project carve-out requires the caller to hold create_project themselves');
select is(
  public.has_credential_access('a9400000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000005'),
  false,
  'INV8: non-admin probing another user''s credential access gets false');
-- admins may still ask about anyone (admin UI needs it)
set local "request.jwt.claims" to '{"sub":"a9000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  public.has_permission('a9000000-0000-4000-8000-000000000002','view_project','a9100000-0000-4000-8000-000000000001'),
  true,
  'INV8: admin can still evaluate another user''s permission');
-- the one legitimate foreign-uid call: "create project" WITH CHECK probes the assigned PM's
-- create_project -- must keep working for a non-admin PM assigning another PM
set local "request.jwt.claims" to '{"sub":"a9000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  public.has_permission('a9000000-0000-4000-8000-000000000003','create_project'),
  true,
  'INV8: create_project holder may probe another user''s create_project (create-form path)');
select lives_ok(
  $$ insert into public.projects (name, pm_id, budget_type)
     values ('INV P2 assigned to Pat', 'a9000000-0000-4000-8000-000000000003', 'fixed') $$,
  'INV8: PM can still create a project assigning another PM (RLS WITH CHECK path)');
-- self-probe still works for everyone (app pages call has_permission with their own uid)
select is(
  public.has_credential_access('a9400000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000002'),
  false,
  'INV8: self-probe on credential access still evaluates (pam has no grant -> false)');
set local "request.jwt.claims" to '{"sub":"a9000000-0000-4000-8000-000000000005","role":"authenticated"}';
select is(
  public.has_credential_access('a9400000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000005'),
  true,
  'INV8: self-probe on credential access still evaluates (mel has a grant -> true)');
reset role;

select * from finish();
rollback;
