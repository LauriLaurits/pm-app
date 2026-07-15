begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- fixtures: PM Petra (owns B1, not B2), finance Fred, member Mia (member of B1)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('e0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','petra@test.local','{"full_name":"Petra"}','{}','',now(),now()),
  ('e0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fred@test.local','{"full_name":"Fred"}','{}','',now(),now()),
  ('e0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mia@test.local','{"full_name":"Mia"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'e0000000-%';
insert into public.user_roles (user_id, role_key) values
  ('e0000000-0000-4000-8000-000000000001','project_manager'),
  ('e0000000-0000-4000-8000-000000000002','finance'),
  ('e0000000-0000-4000-8000-000000000003','member');

insert into public.projects (id, name, pm_id, budget_type) values
  ('e2000000-0000-4000-8000-000000000001','B1','e0000000-0000-4000-8000-000000000001','mixed'),
  ('e2000000-0000-4000-8000-000000000002','B2', null, 'fixed');
insert into public.project_members (project_id, user_id) values
  ('e2000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000003');
insert into public.project_parts (id, project_id, name, billing_model) values
  ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','Discovery','fixed'),
  ('e3000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002','Build','fixed'),
  ('e3000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000001','Delivery','fixed');
insert into public.part_billing (part_id, fixed_amount, client_price) values
  ('e3000000-0000-4000-8000-000000000001', 12000, 12000),
  ('e3000000-0000-4000-8000-000000000002', 30000, 30000);
insert into public.part_costs (part_id, planned_internal_cost, actual_internal_cost) values
  ('e3000000-0000-4000-8000-000000000001', 7000, 4100),
  ('e3000000-0000-4000-8000-000000000002', 15000, 9000);
insert into public.budgets (id, project_id, currency) values
  ('e5000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','EUR');
insert into public.budget_items (budget_id, item_type, name, amount, occurred_on) values
  ('e5000000-0000-4000-8000-000000000001','invoice','Milestone 1', 6000, current_date - 20),
  ('e5000000-0000-4000-8000-000000000001','payment','Milestone 1 paid', 6000, current_date - 5);

-- explicit per-project grant: Mia gets view_internal_cost scoped to B1 ONLY (not global)
insert into public.user_project_permissions (user_id, project_id, permission_key) values
  ('e0000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000001','view_internal_cost');

-- rates fixture (C1): the global rate card must NOT leak via Mia's per-project grant above
insert into public.people (id, full_name) values
  ('e4000000-0000-4000-8000-000000000001','Fixture Person');
insert into public.rates (person_id, rate_type, amount, valid_from) values
  ('e4000000-0000-4000-8000-000000000001','internal_cost', 60, current_date);

-- I1 fixture: a planned_cost item on Petra's own budget (internal money, gated separately below)
insert into public.budget_items (budget_id, item_type, name, amount, occurred_on, created_by) values
  ('e5000000-0000-4000-8000-000000000001','planned_cost','Internal dev cost', 500, current_date - 3, 'e0000000-0000-4000-8000-000000000001');

-- PM: billing on OWN project only; internal costs NEVER
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.part_billing where part_id::text like 'e3000000-%'), 1, 'PM sees billing on own project only');
select is((select count(*)::int from public.part_costs), 0, 'PM never sees internal costs');
select is((select count(*)::int from public.budget_items), 2, 'PM sees own-project budget items');
select is((select count(*)::int from public.budget_items where item_type='planned_cost'), 0, 'PM cannot see internal cost budget items (I1)');
select ok((select count(*)::int from public.budget_items where item_type not in ('planned_cost','actual_cost')) >= 1, 'PM sees invoice/payment items but not cost items');
select lives_ok(
  $$ update public.part_billing set client_price = 12500 where part_id = 'e3000000-0000-4000-8000-000000000001' $$,
  'PM manages billing on own project');
select throws_ok(
  $$ insert into public.part_costs (part_id, planned_internal_cost) values ('e3000000-0000-4000-8000-000000000003', 500) $$,
  '42501', null, 'PM cannot write internal costs');

-- finance: everything financial, everywhere
set local "request.jwt.claims" to '{"sub":"e0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.part_billing where part_id::text like 'e3000000-%'), 2, 'finance sees all billing');
select is((select count(*)::int from public.part_costs where part_id::text like 'e3000000-%'), 2, 'finance sees internal costs');
select lives_ok(
  $$ update public.part_costs set actual_internal_cost = 4200 where part_id = 'e3000000-0000-4000-8000-000000000001' $$,
  'finance manages internal costs');

-- member: nothing financial, except the explicit per-project internal-cost grant on B1 only
set local "request.jwt.claims" to '{"sub":"e0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.part_billing), 0, 'member sees no billing');
select is((select count(*)::int from public.budget_items), 0, 'member sees no budget items');
select is((select count(*)::int from public.part_costs), 1, 'per-project internal-cost grant is project-scoped');
select is((select count(*)::int from public.rates), 0, 'per-project internal-cost grant does NOT expose the global rate card');

-- postgres: DB-level constraint enforcement (bypasses RLS)
reset role;
select throws_ok(
  $$ insert into public.budgets (project_id, currency) values ('e2000000-0000-4000-8000-000000000001', 'EUR') $$,
  '23505', null, 'one project-level budget per project');

-- PM Petra: budget_items attribution cannot be spoofed, but the auth.uid() default works
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ insert into public.budget_items (budget_id, item_type, name, amount, created_by)
     values ('e5000000-0000-4000-8000-000000000001','invoice','Spoofed', 100, 'e0000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'cannot attribute budget items to others');
select lives_ok(
  $$ insert into public.budget_items (budget_id, item_type, name, amount)
     values ('e5000000-0000-4000-8000-000000000001','invoice','Attributed', 100) $$,
  'default attribution works');

-- postgres: seed a budget_items row attributed to finance Fred (simulating a colleague's entry)
reset role;
insert into public.budget_items (budget_id, item_type, name, amount, created_by) values
  ('e5000000-0000-4000-8000-000000000001','planned_cost','Fred entry', 250, 'e0000000-0000-4000-8000-000000000002');

-- PM Petra manages budget items she didn't personally create, but cannot rewrite attribution
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ update public.budget_items set amount = 275 where budget_id = 'e5000000-0000-4000-8000-000000000001' and name = 'Fred entry' $$,
  'manager can update items created by others');
select throws_ok(
  $$ update public.budget_items set created_by = 'e0000000-0000-4000-8000-000000000001' where budget_id = 'e5000000-0000-4000-8000-000000000001' and name = 'Fred entry' $$,
  '42501', null, 'attribution is immutable');

select * from finish();
rollback;
