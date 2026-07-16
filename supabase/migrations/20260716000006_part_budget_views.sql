-- Phase 5, Task 2: per-part budget read-model for the project Budgets tab.
--
-- part_budget_rows rolls up, per project part, the client-facing figures (fixed_amount,
-- hourly_rate, client_price, invoiced/paid/remaining against a part-level budget where one
-- exists) and the finance-only figures (planned_internal_cost, actual_internal_cost, margin,
-- margin_pct) into one row -- the exact same two-tier gating discipline as
-- `project_budget_rows` (20260716000005_budget_views.sql), just at part granularity.
--
-- MUST be `security_invoker = true` for the same reason documented there: an owner-invoker view
-- runs as the migration role, which owns every table and bypasses RLS -- that would leak every
-- part's client pricing AND internal cost/margin to every authenticated user. With
-- security_invoker, each LEFT JOIN below re-runs under the CALLING user's row security:
--
--   * part_id/project_id/part_name/billing_model/estimated_hours come straight off
--     `project_parts`, gated by `view_project` RLS (own/member/global per role) -- the same
--     visibility as the Parts tab. A caller who can't see the project's parts gets zero rows
--     back, not an error.
--
--   * logged_hours/billable_hours come from `time_entries` (gated by its own RLS: a caller
--     always sees their own logged rows, plus every row on the project if they hold
--     `view_time`). This is coarser than the client/finance gate below on purpose -- hours
--     logged is operational data, not the money -- but it means a viewer without `view_time`
--     who also isn't the one who logged the hours sees 0, not a true project total. That
--     matches the existing time_entries precedent (Phase 4 workload views); it is not a new
--     leak surface for THIS task, which only has to gate client/finance money.
--
--   * fixed_amount/hourly_rate/client_price come from `part_billing`, gated by `view_budget`
--     RLS. invoiced/paid/remaining come from `budget_items` via a PART-LEVEL `budgets` row
--     (budget_id where budgets.part_id = this part -- distinct from the project-level budget
--     rows `project_budget_rows` already rolls up). They null out together with client_price
--     for a caller without view_budget -- never a misleading 0.
--
--   * planned_internal_cost/actual_internal_cost come from `part_costs`, gated by
--     `view_internal_cost` RLS (finance only). margin/margin_pct need BOTH client_price and
--     actual_internal_cost, so they collapse to NULL unless the caller has both view_budget
--     AND view_internal_cost -- in practice, finance only. Per the brief: margin is computed as
--     `client_price - actual_internal_cost`, NOT `client_price - coalesce(actual_internal_cost, 0)`
--     -- a null cost must yield a null margin, never a fake "full margin" number.
--
-- Money semantics (mirrors project_budget_rows):
--   invoiced/paid  = sum(budget_items.amount) by item_type, via a budgets row with
--                    part_id = this part (coalesced to 0 once client_price is visible --
--                    "no part-level invoices yet" is a real, visible zero once you can see the
--                    part's client price at all)
--   remaining      = client_price - invoiced
--   margin         = client_price - actual_internal_cost (null unless BOTH visible)
--   margin_pct     = margin / client_price * 100, null-safe

create view public.part_budget_rows
with (security_invoker = true)
as
select
  pp.id as part_id,
  pp.project_id,
  pp.name as part_name,
  pp.billing_model,
  pp.estimated_hours,
  coalesce(hours.logged_hours, 0) as logged_hours,
  coalesce(hours.billable_hours, 0) as billable_hours,
  pb.fixed_amount,
  pb.hourly_rate,
  pb.client_price,
  case when pb.client_price is null then null
       else coalesce(items.invoiced, 0) end as invoiced,
  case when pb.client_price is null then null
       else coalesce(items.paid, 0) end as paid,
  case when pb.client_price is null then null
       else pb.client_price - coalesce(items.invoiced, 0) end as remaining,
  pc.planned_internal_cost,
  pc.actual_internal_cost,
  case when pb.client_price is null or pc.actual_internal_cost is null then null
       else pb.client_price - pc.actual_internal_cost end as margin,
  case when pb.client_price is null or pb.client_price = 0 or pc.actual_internal_cost is null then null
       else round((pb.client_price - pc.actual_internal_cost) / pb.client_price * 100, 2) end as margin_pct
from public.project_parts pp
left join public.part_billing pb on pb.part_id = pp.id
left join public.part_costs pc on pc.part_id = pp.id
left join lateral (
  select
    sum(te.hours) as logged_hours,
    sum(te.hours) filter (where te.billable) as billable_hours
  from public.time_entries te
  where te.project_part_id = pp.id
) hours on true
left join lateral (
  select
    sum(bi.amount) filter (where bi.item_type = 'invoice') as invoiced,
    sum(bi.amount) filter (where bi.item_type = 'payment') as paid
  from public.budgets bud
  join public.budget_items bi on bi.budget_id = bud.id
  where bud.part_id = pp.id
) items on true;

grant select on public.part_budget_rows to authenticated;
grant select on public.part_budget_rows to service_role;
