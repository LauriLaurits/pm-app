begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- fixtures: PM Gina (owns P1, portfolio-views P2), PM Bea (owns P2), finance Fia,
-- member Milo (member of P1 only). Two projects, each with its own billing + a payment,
-- so the budget rollup and its per-role gating are both exercised.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('9a000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','gina@test.local','{"full_name":"Gina Profile"}','{}','',now(),now()),
  ('9a000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','bea@test.local','{"full_name":"Bea Profile"}','{}','',now(),now()),
  ('9a000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fia@test.local','{"full_name":"Fia Profile"}','{}','',now(),now()),
  ('9a000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','milo@test.local','{"full_name":"Milo Profile"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like '9a000000-%';
insert into public.user_roles (user_id, role_key) values
  ('9a000000-0000-4000-8000-000000000001','project_manager'),
  ('9a000000-0000-4000-8000-000000000002','project_manager'),
  ('9a000000-0000-4000-8000-000000000003','finance'),
  ('9a000000-0000-4000-8000-000000000004','member');

-- people directory names deliberately differ from user_profiles.full_name above, so a pass
-- here proves pm_name is resolved via `people` (broadly readable) and NOT `user_profiles`
-- (self/admin only) -- joining the latter would leave pm_name null for non-owning viewers.
insert into public.people (id, user_id, full_name) values
  ('9a100000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000001','Gina People');

insert into public.clients (id, name) values ('9a200000-0000-4000-8000-000000000001','TestCo');
insert into public.projects (id, name, client_id, pm_id, status, health, budget_type) values
  ('9a300000-0000-4000-8000-000000000001','P1','9a200000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000001','active','healthy','fixed'),
  ('9a300000-0000-4000-8000-000000000002','P2','9a200000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000002','active','healthy','fixed');
insert into public.project_members (project_id, user_id) values
  ('9a300000-0000-4000-8000-000000000001','9a000000-0000-4000-8000-000000000004');

insert into public.project_parts (id, project_id, name, billing_model) values
  ('9a400000-0000-4000-8000-000000000001','9a300000-0000-4000-8000-000000000001','P1 Part','fixed'),
  ('9a400000-0000-4000-8000-000000000002','9a300000-0000-4000-8000-000000000002','P2 Part','fixed');
insert into public.part_billing (part_id, fixed_amount, client_price) values
  ('9a400000-0000-4000-8000-000000000001', 10000, 10000),
  ('9a400000-0000-4000-8000-000000000002', 20000, 20000);
insert into public.budgets (id, project_id) values
  ('9a500000-0000-4000-8000-000000000001','9a300000-0000-4000-8000-000000000001'),
  ('9a500000-0000-4000-8000-000000000002','9a300000-0000-4000-8000-000000000002');
insert into public.budget_items (budget_id, item_type, name, amount, occurred_on) values
  ('9a500000-0000-4000-8000-000000000001','payment','P1 payment', 4000, current_date - 5),
  ('9a500000-0000-4000-8000-000000000002','payment','P2 payment', 5000, current_date - 5);

-- member Milo: sees only his own project row; no budget figures; no client name either
-- (view_clients isn't granted to `member` at all -- same RLS-driven null as budgets).
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"9a000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select count(*)::int from public.project_list_rows where id::text like '9a300000-%'), 1, 'member sees only their own project row');
select is((select budget_total from public.project_list_rows where id = '9a300000-0000-4000-8000-000000000001'), null, 'member: budget_total null (no view_budget at all)');
select is((select client_name from public.project_list_rows where id = '9a300000-0000-4000-8000-000000000001'), null, 'member: client_name null (no view_clients)');
select is((select pm_name from public.project_list_rows where id = '9a300000-0000-4000-8000-000000000001'), 'Gina People', 'member: pm_name still resolves via people, not user_profiles');

-- PM Gina: portfolio view (both rows), but budget figures ONLY on her own project (own_projects
-- scope) -- P2's billing must NOT leak through the security_invoker view just because she can
-- browse the row.
set local "request.jwt.claims" to '{"sub":"9a000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.project_list_rows where id::text like '9a300000-%'), 2, 'PM sees the whole portfolio (2 rows)');
select results_eq(
  $$ select budget_total, budget_used, budget_remaining from public.project_list_rows where id = '9a300000-0000-4000-8000-000000000001' $$,
  $$ values (10000::numeric, 4000::numeric, 6000::numeric) $$,
  'PM: budget figures present + correctly summed on own project');
select is((select budget_total from public.project_list_rows where id = '9a300000-0000-4000-8000-000000000002'), null, 'PM: budget_total null on a colleague''s project (own_projects scope holds)');

-- finance Fia: everything, everywhere -- including the colleague's project PM couldn't see
set local "request.jwt.claims" to '{"sub":"9a000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.project_list_rows where id::text like '9a300000-%'), 2, 'finance sees both projects');
select is((select budget_total from public.project_list_rows where id = '9a300000-0000-4000-8000-000000000002'), 20000::numeric, 'finance: budget_total visible globally, even on a project she has no membership/ownership in');

select * from finish();
rollback;
