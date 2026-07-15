-- Phase 3, Task 2: projects list read-model.
--
-- project_list_rows rolls up a project + its client/PM/member-count/budget rollup into one
-- row for the /projects screen. It MUST be `security_invoker = true` (Postgres 15+): a plain
-- view runs with the privileges of its OWNER (the migration role, which owns every table and
-- is not subject to RLS), so an owner-invoker view here would leak every project and every
-- budget figure to every authenticated user regardless of their actual permissions. With
-- security_invoker, the view has no privileges of its own -- every join re-runs under the
-- CALLING user's row security, exactly as if they'd written the joins themselves. That is what
-- makes the budget columns genuinely permission-gated instead of just hidden by the client.
--
-- pm_name/pm_avatar_url are read from `public.people` (RLS: `view_people`, granted globally to
-- every seeded role -- project_manager, finance, member) rather than `public.user_profiles`
-- (RLS: readable only by the row's own owner or an admin -- see 20260714000001_phase1_auth.sql
-- policies "read own profile" / "admins read all profiles"). Joining user_profiles directly
-- would make pm_name null for every project a viewer doesn't personally own, including for a
-- PM looking at her own portfolio. `people` is this codebase's existing "who is this person"
-- directory and is the right join target for display name/avatar.
--
-- client_name follows the real `view_clients` grant (project_manager + finance globally; NOT
-- granted to `member` in 20260715000002_permission_model.sql) -- so for a member this column is
-- null, same as the budget columns, and the UI renders "—" for it. This is an existing Phase 2
-- permission-model decision (members aren't granted view_clients), not something this
-- migration changes; flagged in the Task 2 report as a possible follow-up.
--
-- Budget rollup (kept intentionally simple per the plan):
--   budget_total = sum(part_billing.client_price) across the project's parts
--   budget_used  = sum(budget_items.amount) where item_type = 'payment', across the project's budgets
--   budget_remaining = budget_total - budget_used
-- part_billing/budgets/budget_items are all gated by `view_budget` (own_projects for PM, global
-- for finance, absent entirely for member) -- a caller without it simply gets zero rows back
-- from those joins, so budget_total is null (and budget_used/budget_remaining follow suit).

create view public.project_list_rows
with (security_invoker = true)
as
select
  p.id,
  p.name,
  c.name as client_name,
  pm.full_name as pm_name,
  pm.avatar_url as pm_avatar_url,
  p.status,
  p.health,
  p.priority,
  p.start_date,
  p.deadline,
  p.progress,
  p.budget_type,
  p.updated_at,
  coalesce(members.member_count, 0) as member_count,
  billing.budget_total,
  case when billing.budget_total is null then null
       else coalesce(items.budget_used, 0) end as budget_used,
  case when billing.budget_total is null then null
       else billing.budget_total - coalesce(items.budget_used, 0) end as budget_remaining
from public.projects p
left join public.clients c on c.id = p.client_id
left join public.people pm on pm.user_id = p.pm_id
left join lateral (
  select count(*)::int as member_count
  from public.project_members pmem
  where pmem.project_id = p.id
) members on true
left join lateral (
  select sum(pb.client_price) as budget_total
  from public.project_parts pp
  join public.part_billing pb on pb.part_id = pp.id
  where pp.project_id = p.id
) billing on true
left join lateral (
  select sum(bi.amount) as budget_used
  from public.budgets bud
  join public.budget_items bi on bi.budget_id = bud.id and bi.item_type = 'payment'
  where bud.project_id = p.id
) items on true;

grant select on public.project_list_rows to authenticated;
grant select on public.project_list_rows to service_role;
