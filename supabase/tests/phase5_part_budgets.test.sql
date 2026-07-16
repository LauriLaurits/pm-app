begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- fixtures: PM Gia (owns A), PM Bob (owns B), finance Fia, member Milo (member of A only, no
-- view_budget). Project A has one fixed part with billing + cost + a part-level budget (one
-- invoice) so client/margin math is exercised on a known fixture; project B (Bob's) has a part
-- with billing + cost too, used only to prove the own_projects boundary holds at part
-- granularity, not just project granularity.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('f6000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gia2@test.local','{"full_name":"Gia"}','{}','',now(),now()),
  ('f6000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','bob2@test.local','{"full_name":"Bob"}','{}','',now(),now()),
  ('f6000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fia2@test.local','{"full_name":"Fia"}','{}','',now(),now()),
  ('f6000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','milo2@test.local','{"full_name":"Milo"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'f6000000-%';
insert into public.user_roles (user_id, role_key) values
  ('f6000000-0000-4000-8000-000000000001','project_manager'),
  ('f6000000-0000-4000-8000-000000000002','project_manager'),
  ('f6000000-0000-4000-8000-000000000003','finance'),
  ('f6000000-0000-4000-8000-000000000004','member');

insert into public.clients (id, name) values ('f6100000-0000-4000-8000-000000000001','TestCo2');
insert into public.projects (id, name, client_id, pm_id, status, health, budget_type) values
  ('f6300000-0000-4000-8000-000000000001','A2','f6100000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000001','active','healthy','fixed'),
  ('f6300000-0000-4000-8000-000000000002','B2','f6100000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000002','active','healthy','fixed');
insert into public.project_members (project_id, user_id) values
  ('f6300000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000004');

insert into public.project_parts (id, project_id, name, billing_model) values
  ('f6400000-0000-4000-8000-000000000001','f6300000-0000-4000-8000-000000000001','A2 Part 1','fixed'),
  ('f6400000-0000-4000-8000-000000000002','f6300000-0000-4000-8000-000000000002','B2 Part 1','fixed');
insert into public.part_billing (part_id, fixed_amount, client_price) values
  ('f6400000-0000-4000-8000-000000000001', 10000, 10000),
  ('f6400000-0000-4000-8000-000000000002', 20000, 20000);
insert into public.part_costs (part_id, planned_internal_cost, actual_internal_cost) values
  ('f6400000-0000-4000-8000-000000000001', 3500, 3000),
  ('f6400000-0000-4000-8000-000000000002', 9000, 8000);

insert into public.budgets (id, project_id, part_id) values
  ('f6500000-0000-4000-8000-000000000001','f6300000-0000-4000-8000-000000000001','f6400000-0000-4000-8000-000000000001');
insert into public.budget_items (budget_id, item_type, name, amount, occurred_on) values
  ('f6500000-0000-4000-8000-000000000001','invoice','A2 Milestone 1', 6000, current_date - 10);

-- member Milo: no view_budget/view_internal_cost -> client_price/margin NULL on his own
-- project's part, never a real-looking 0. (billing_model stays visible: it's not gated money.)
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"f6000000-0000-4000-8000-000000000004","role":"authenticated"}';
select results_eq(
  $$ select client_price, fixed_amount, invoiced, margin from public.part_budget_rows where part_id = 'f6400000-0000-4000-8000-000000000001' $$,
  $$ values (null::numeric, null::numeric, null::numeric, null::numeric) $$,
  'member: client_price/fixed_amount/invoiced/margin all NULL (no view_budget/view_internal_cost)');
select is((select billing_model::text from public.part_budget_rows where part_id = 'f6400000-0000-4000-8000-000000000001'), 'fixed', 'member: billing_model still visible (not gated money)');

-- PM Gia: client_price/invoiced visible on OWN project's part, internal cost/margin NULL.
set local "request.jwt.claims" to '{"sub":"f6000000-0000-4000-8000-000000000001","role":"authenticated"}';
select results_eq(
  $$ select client_price, invoiced, remaining from public.part_budget_rows where part_id = 'f6400000-0000-4000-8000-000000000001' $$,
  $$ values (10000::numeric, 6000::numeric, 4000::numeric) $$,
  'PM: client_price/invoiced/remaining correct on own project''s part');
select results_eq(
  $$ select planned_internal_cost, actual_internal_cost, margin, margin_pct from public.part_budget_rows where part_id = 'f6400000-0000-4000-8000-000000000001' $$,
  $$ values (null::numeric, null::numeric, null::numeric, null::numeric) $$,
  'PM: internal cost/margin/margin_pct NULL (no view_internal_cost)');
select is((select client_price from public.part_budget_rows where part_id = 'f6400000-0000-4000-8000-000000000002'), null, 'PM: client_price NULL on colleague''s project part (own_projects scope holds at part granularity)');

-- finance Fia: full two-tier visibility, and margin math is exact (10000 - 3000 = 7000, 70%).
set local "request.jwt.claims" to '{"sub":"f6000000-0000-4000-8000-000000000003","role":"authenticated"}';
select results_eq(
  $$ select client_price, actual_internal_cost, margin, margin_pct from public.part_budget_rows where part_id = 'f6400000-0000-4000-8000-000000000001' $$,
  $$ values (10000::numeric, 3000::numeric, 7000::numeric, 70.00::numeric) $$,
  'finance: client_price/actual_internal_cost/margin/margin_pct all correct on the part');

select * from finish();
rollback;
