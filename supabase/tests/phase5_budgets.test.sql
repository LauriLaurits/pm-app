begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- fixtures: PM Gia (owns A, portfolio-views B), PM Bob (owns B), finance Fia, member Milo
-- (member of A only, no view_budget). Project A has two parts (billing + cost on both) and a
-- budget with one invoice + one payment, so consumption_pct/margin math is exercised on a known
-- fixture. Project B has billing + cost but deliberately NO budgets row, so client_amount is
-- still computed straight off part_billing while invoiced/paid/remaining default to a real 0
-- (not a permission-gated null) once the viewer can see budgets at all.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('f5000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gia@test.local','{"full_name":"Gia"}','{}','',now(),now()),
  ('f5000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','bob@test.local','{"full_name":"Bob"}','{}','',now(),now()),
  ('f5000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fia@test.local','{"full_name":"Fia"}','{}','',now(),now()),
  ('f5000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','milo@test.local','{"full_name":"Milo"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'f5000000-%';
insert into public.user_roles (user_id, role_key) values
  ('f5000000-0000-4000-8000-000000000001','project_manager'),
  ('f5000000-0000-4000-8000-000000000002','project_manager'),
  ('f5000000-0000-4000-8000-000000000003','finance'),
  ('f5000000-0000-4000-8000-000000000004','member');

insert into public.clients (id, name) values ('f5100000-0000-4000-8000-000000000001','TestCo');
insert into public.projects (id, name, client_id, pm_id, status, health, budget_type) values
  ('f5300000-0000-4000-8000-000000000001','A','f5100000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','active','healthy','fixed'),
  ('f5300000-0000-4000-8000-000000000002','B','f5100000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000002','active','healthy','fixed');
insert into public.project_members (project_id, user_id) values
  ('f5300000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000004');

insert into public.project_parts (id, project_id, name, billing_model) values
  ('f5400000-0000-4000-8000-000000000001','f5300000-0000-4000-8000-000000000001','A Part 1','fixed'),
  ('f5400000-0000-4000-8000-000000000002','f5300000-0000-4000-8000-000000000001','A Part 2','fixed'),
  ('f5400000-0000-4000-8000-000000000003','f5300000-0000-4000-8000-000000000002','B Part 1','fixed');
insert into public.part_billing (part_id, fixed_amount, client_price) values
  ('f5400000-0000-4000-8000-000000000001', 10000, 10000),
  ('f5400000-0000-4000-8000-000000000002', 5000, 5000),
  ('f5400000-0000-4000-8000-000000000003', 20000, 20000);
insert into public.part_costs (part_id, planned_internal_cost, actual_internal_cost) values
  ('f5400000-0000-4000-8000-000000000001', 3500, 3000),
  ('f5400000-0000-4000-8000-000000000002', 2200, 2000),
  ('f5400000-0000-4000-8000-000000000003', 9000, 8000);

insert into public.budgets (id, project_id) values
  ('f5500000-0000-4000-8000-000000000001','f5300000-0000-4000-8000-000000000001');
-- no budgets row for B (on purpose -- exercises the "no budgets row yet" default-to-0 case)
insert into public.budget_items (budget_id, item_type, name, amount, occurred_on) values
  ('f5500000-0000-4000-8000-000000000001','invoice','A Milestone 1', 6000, current_date - 10),
  ('f5500000-0000-4000-8000-000000000001','payment','A Milestone 1 paid', 4000, current_date - 5);

-- member Milo: no view_budget at all -> every financial column on A (his own project) is NULL,
-- never a real-looking 0.
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"f5000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select client_amount from public.project_budget_rows where id = 'f5300000-0000-4000-8000-000000000001'), null, 'member: client_amount NULL (no view_budget)');
select is((select consumption_pct from public.project_budget_rows where id = 'f5300000-0000-4000-8000-000000000001'), null, 'member: consumption_pct NULL too (derived from client_amount)');

-- PM Gia: client_amount present on OWN project A and matches the sum of its parts' client_price,
-- but internal_cost/margin/margin_pct stay NULL -- she has view_budget, not view_internal_cost.
set local "request.jwt.claims" to '{"sub":"f5000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select client_amount from public.project_budget_rows where id = 'f5300000-0000-4000-8000-000000000001'), 15000::numeric, 'PM: client_amount on own project == sum(part_billing.client_price)');
select results_eq(
  $$ select internal_cost, margin, margin_pct from public.project_budget_rows where id = 'f5300000-0000-4000-8000-000000000001' $$,
  $$ values (null::numeric, null::numeric, null::numeric) $$,
  'PM: internal_cost/margin/margin_pct NULL (no view_internal_cost)');
select is((select client_amount from public.project_budget_rows where id = 'f5300000-0000-4000-8000-000000000002'), null, 'PM: client_amount NULL on colleague''s project B (own_projects scope holds)');

-- finance Fia: full two-tier visibility, everywhere -- and the consumption/margin math is exact.
set local "request.jwt.claims" to '{"sub":"f5000000-0000-4000-8000-000000000003","role":"authenticated"}';
select results_eq(
  $$ select client_amount, invoiced, paid, remaining, consumption_pct from public.project_budget_rows where id = 'f5300000-0000-4000-8000-000000000001' $$,
  $$ values (15000::numeric, 6000::numeric, 4000::numeric, 9000::numeric, 40.00::numeric) $$,
  'finance: client-side budget math correct on A (client_amount 15000, invoiced 6000, consumption 40.00%)');
select results_eq(
  $$ select internal_cost, margin, margin_pct from public.project_budget_rows where id = 'f5300000-0000-4000-8000-000000000001' $$,
  $$ values (5000::numeric, 10000::numeric, 66.67::numeric) $$,
  'finance: internal_cost/margin/margin_pct correct on A (cost 5000, margin 10000, 66.67%)');
select results_eq(
  $$ select client_amount, invoiced, paid, remaining from public.project_budget_rows where id = 'f5300000-0000-4000-8000-000000000002' $$,
  $$ values (20000::numeric, 0::numeric, 0::numeric, 20000::numeric) $$,
  'finance: project B (no budgets row) shows client_amount from billing with invoiced/paid defaulting to a real 0');

select * from finish();
rollback;
