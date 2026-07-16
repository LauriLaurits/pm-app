begin;
create extension if not exists pgtap with schema extensions;
select plan(7);
-- 1 row-count, 2 non-finance null, 3 finance non-null, 4 overallocated, 5 available, 6 vacation,
-- 7 partial-overlap member sees TRUE global allocation (not RLS-understated)

-- fixtures: PM Paula, member Milo, finance Fia, member Sam (partial project overlap); a project PZ
-- and PZ2; five people:
--   WorkerOver  -- two overlapping assignments summing to 130% (overallocated) -- one on PZ (which
--                  Sam is a project_members row on), one on PZ2 (which Sam has no access to at all)
--   WorkerLow   -- one assignment at 30% (available, <50%)
--   WorkerVac   -- no assignment, on vacation covering today
--   WorkerPlain -- no assignment, no vacation (baseline row count fixture)
--   Sam         -- member linked to a person row, added to project_members on PZ only (not PZ2)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, encrypted_password, created_at, updated_at) values
  ('e0000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','paula@test.local','{"full_name":"Paula"}','{}','',now(),now()),
  ('e0000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','milo@test.local','{"full_name":"Milo"}','{}','',now(),now()),
  ('e0000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','fia@test.local','{"full_name":"Fia"}','{}','',now(),now()),
  ('e0000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sam@test.local','{"full_name":"Sam"}','{}','',now(),now());
update public.user_profiles set status='active' where id::text like 'e0000000-%';
insert into public.user_roles (user_id, role_key) values
  ('e0000000-0000-4000-8000-000000000001','project_manager'),
  ('e0000000-0000-4000-8000-000000000002','member'),
  ('e0000000-0000-4000-8000-000000000003','finance'),
  ('e0000000-0000-4000-8000-000000000004','member');

insert into public.projects (id, name, pm_id, budget_type) values
  ('e2000000-0000-4000-8000-000000000001','PZ','e0000000-0000-4000-8000-000000000001','hourly'),
  ('e2000000-0000-4000-8000-000000000002','PZ2','e0000000-0000-4000-8000-000000000001','hourly');

-- Sam is a project_members row on PZ only -- gives Sam view_team (member_projects scope) on PZ,
-- but NOT on PZ2, so the RLS-scoped `assignments` policy hides WorkerOver's PZ2 row from Sam.
insert into public.project_members (project_id, user_id, role_on_project) values
  ('e2000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000004','contributor');

insert into public.people (id, user_id, full_name, weekly_capacity_hours) values
  ('e4000000-0000-4000-8000-000000000001', null, 'Worker Over', 40),
  ('e4000000-0000-4000-8000-000000000002', null, 'Worker Low', 40),
  ('e4000000-0000-4000-8000-000000000003', null, 'Worker Vac', 40),
  ('e4000000-0000-4000-8000-000000000004', null, 'Worker Plain', 40),
  ('e4000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000004', 'Sam Member', 40);

insert into public.rates (person_id, rate_type, amount, valid_from) values
  ('e4000000-0000-4000-8000-000000000001','internal_cost', 60, current_date - 100),
  ('e4000000-0000-4000-8000-000000000001','billing', 120, current_date - 100);

insert into public.assignments (project_id, project_part_id, person_id, allocation_pct, start_date, end_date) values
  ('e2000000-0000-4000-8000-000000000001', null, 'e4000000-0000-4000-8000-000000000001', 70, current_date - 30, current_date + 30),
  ('e2000000-0000-4000-8000-000000000002', null, 'e4000000-0000-4000-8000-000000000001', 60, current_date - 30, current_date + 30),
  ('e2000000-0000-4000-8000-000000000001', null, 'e4000000-0000-4000-8000-000000000002', 30, current_date - 30, current_date + 30);

insert into public.time_off (person_id, starts_on, ends_on, type) values
  ('e4000000-0000-4000-8000-000000000003', current_date - 2, current_date + 5, 'vacation');

-- member Milo: sees all five rows (view_people is granted globally to `member`), but the
-- finance-only columns are null -- rates RLS ("finance reads rates") hides the join.
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"e0000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select count(*)::int from public.person_workload_rows where id::text like 'e4000000-%'),
  5,
  'member (internal role) sees all fixture rows -- row count = people count'
);
select results_eq(
  $$ select internal_cost, billing_rate from public.person_workload_rows where id = 'e4000000-0000-4000-8000-000000000001' $$,
  $$ values (null::numeric, null::numeric) $$,
  'member: internal_cost + billing_rate both null (no view_internal_cost)'
);

-- finance Fia: same rows, but cost/rate resolve through the security_invoker join
set local "request.jwt.claims" to '{"sub":"e0000000-0000-4000-8000-000000000003","role":"authenticated"}';
select results_eq(
  $$ select internal_cost, billing_rate from public.person_workload_rows where id = 'e4000000-0000-4000-8000-000000000001' $$,
  $$ values (60::numeric, 120::numeric) $$,
  'finance: internal_cost + billing_rate visible and correct'
);

-- allocation math: WorkerOver sums 70+60=130 (overallocated); WorkerLow is 30 (<50, available)
select is(
  (select current_allocation_pct from public.person_workload_rows where id = 'e4000000-0000-4000-8000-000000000001'),
  130::numeric,
  'WorkerOver: current_allocation_pct = 130 (overallocated, two active assignments)'
);
select is(
  (select current_allocation_pct from public.person_workload_rows where id = 'e4000000-0000-4000-8000-000000000002'),
  30::numeric,
  'WorkerLow: current_allocation_pct = 30 (available, <50%)'
);

-- vacation: WorkerVac has a vacation row covering today
select is(
  (select on_vacation_now from public.person_workload_rows where id = 'e4000000-0000-4000-8000-000000000003'),
  true,
  'WorkerVac: on_vacation_now true'
);

-- member Sam only shares PZ with WorkerOver (not PZ2) -- if current_allocation_pct were computed
-- from the RLS-scoped `assignments` rows Sam can see directly, it would understate to 70 (just the
-- shared-project assignment). It must instead reflect WorkerOver's TRUE global sum of 130, because
-- current_allocation_pct is sourced from the security-definer public.person_current_allocation(),
-- not from Sam's RLS-visible assignment rows.
set local "request.jwt.claims" to '{"sub":"e0000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is(
  (select current_allocation_pct from public.person_workload_rows where id = 'e4000000-0000-4000-8000-000000000001'),
  130::numeric,
  'partial-overlap member Sam still sees WorkerOver''s TRUE global current_allocation_pct = 130 (not the RLS-understated 70)'
);

select * from finish();
rollback;
