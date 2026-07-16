-- Phase 5, Task 1: budget read-models for the portfolio budget dashboard.
--
-- project_budget_rows rolls up, per project, the client-facing budget figures (client_amount,
-- invoiced, paid, remaining, consumption_pct) and the finance-only figures (internal_cost,
-- margin, margin_pct) into one row. It MUST be `security_invoker = true` for exactly the reason
-- documented at length in 20260715000007_project_views.sql: a plain (owner-invoker) view runs
-- as the migration role, which owns every table and bypasses RLS entirely -- that would leak
-- every project's client pricing AND internal cost/margin to every authenticated user. With
-- security_invoker, each LEFT JOIN LATERAL below re-runs under the CALLING user's row security:
--
--   * client_amount/invoiced/paid/remaining/consumption_pct come from `part_billing` (via the
--     project's parts) and `budget_items` (via the project's budgets rows) -- both gated by
--     `view_budget` RLS (own_projects for PM, global for finance; absent for member). A caller
--     without it gets zero rows back from those joins, so client_amount is NULL and everything
--     derived from it (invoiced/paid/remaining/consumption_pct) is NULL too -- never zero, which
--     would misleadingly read as "a real $0 budget" instead of "you can't see this".
--
--   * internal_cost comes from `part_costs` (via the project's parts), gated by
--     `view_internal_cost` RLS (finance globally; nobody else by default). margin/margin_pct
--     need BOTH client_amount and internal_cost, so they collapse to NULL unless the caller has
--     both permissions -- in practice, finance only. A PM with view_budget but not
--     view_internal_cost sees client_amount fully populated but internal_cost/margin/margin_pct
--     NULL, exactly per the plan's two-tier gating.
--
-- Money semantics (kept deliberately simple, matching the task brief):
--   client_amount    = sum(part_billing.client_price) across the project's parts
--   invoiced         = sum(budget_items.amount) where item_type = 'invoice', across the
--                      project's budgets rows (coalesced to 0 once client_amount is visible --
--                      "no invoices yet" is a real, visible zero, not a permission gap)
--   paid             = sum(budget_items.amount) where item_type = 'payment', same gating
--   remaining        = client_amount - invoiced
--   consumption_pct  = invoiced / client_amount * 100, null-safe (null when client_amount is
--                      null OR zero -- avoids a divide-by-zero and avoids implying 0% consumed
--                      when there's no client_amount to consume against)
--   internal_cost    = sum(part_costs.actual_internal_cost) across the project's parts
--   margin           = client_amount - internal_cost (null unless BOTH are visible)
--   margin_pct       = margin / client_amount * 100, null-safe

create view public.project_budget_rows
with (security_invoker = true)
as
select
  p.id,
  p.name,
  c.name as client_name,
  p.budget_type,
  p.health,
  billing.client_amount,
  case when billing.client_amount is null then null
       else coalesce(items.invoiced, 0) end as invoiced,
  case when billing.client_amount is null then null
       else coalesce(items.paid, 0) end as paid,
  case when billing.client_amount is null then null
       else billing.client_amount - coalesce(items.invoiced, 0) end as remaining,
  case when billing.client_amount is null or billing.client_amount = 0 then null
       else round(coalesce(items.invoiced, 0) / billing.client_amount * 100, 2) end as consumption_pct,
  costs.internal_cost,
  case when billing.client_amount is null or costs.internal_cost is null then null
       else billing.client_amount - costs.internal_cost end as margin,
  case when billing.client_amount is null or billing.client_amount = 0 or costs.internal_cost is null then null
       else round((billing.client_amount - costs.internal_cost) / billing.client_amount * 100, 2) end as margin_pct
from public.projects p
left join public.clients c on c.id = p.client_id
left join lateral (
  select sum(pb.client_price) as client_amount
  from public.project_parts pp
  join public.part_billing pb on pb.part_id = pp.id
  where pp.project_id = p.id
) billing on true
left join lateral (
  select
    sum(bi.amount) filter (where bi.item_type = 'invoice') as invoiced,
    sum(bi.amount) filter (where bi.item_type = 'payment') as paid
  from public.budgets bud
  join public.budget_items bi on bi.budget_id = bud.id
  where bud.project_id = p.id
) items on true
left join lateral (
  select sum(pc.actual_internal_cost) as internal_cost
  from public.project_parts pp
  join public.part_costs pc on pc.part_id = pp.id
  where pp.project_id = p.id
) costs on true;

grant select on public.project_budget_rows to authenticated;
grant select on public.project_budget_rows to service_role;
