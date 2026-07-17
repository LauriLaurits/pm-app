import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { BudgetSummary } from "./budget-summary";
import { BudgetPartsTable } from "./budget-parts-table";
import { BudgetPlanVsActual } from "./budget-plan-vs-actual";
import { BudgetForecast } from "./budget-forecast";
import { BudgetMonthlyTable } from "./budget-monthly-table";
import { BudgetChanges } from "./budget-changes";
import { BudgetItemsList } from "./budget-items-list";
import { BudgetItemFormDialog } from "./budget-item-form-dialog";
import { buildMonthlyBreakdown, type BudgetItemRow, type PartBudgetRow, type ProjectBudgetRow } from "./types";

export default async function ProjectBudgetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS ("view project") means a caller without access gets zero rows -- indistinguishable from
  // not existing, which is the point. Layout already 404s too, but this route can be reached
  // directly, so check again here (same precedent as the Parts tab).
  const { data: project } = await supabase
    .from("projects")
    .select("id, progress")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  // UX gating only -- the real security boundary is requirePermission() inside every budget
  // server action (upsertPartBillingAction/upsertPartCostsAction/addBudgetItemAction/
  // deleteBudgetItemAction), which re-checks has_permission server-side regardless of what's
  // rendered here. canManageBudget is what unblocks finance (manage_budget: global) -- this is
  // the fix for the bug where the only billing-entry surface was gated on edit_project instead,
  // which finance never holds. canManageCost is finance-only in practice (view_internal_cost is
  // never granted to PM/member) and must NEVER be used to render internal-cost inputs to anyone
  // else.
  const current = await getCurrentUser();
  const [{ data: canManageBudget }, { data: canManageCost }] = current
    ? await Promise.all([
        supabase.rpc("has_permission", { uid: current.user.id, perm: "manage_budget", project: id }),
        supabase.rpc("has_permission", { uid: current.user.id, perm: "view_internal_cost", project: id }),
      ])
    : [{ data: false }, { data: false }];

  // project_budget_rows / part_budget_rows are security_invoker views (migrations
  // 20260716000005 + 20260716000006): client-facing columns are null unless this caller has
  // view_budget on the project; internal cost/margin columns are null unless they ALSO have
  // view_internal_cost. Never re-derive margin from a separately fetched cost -- consume the
  // views' columns as-is, everywhere below.
  const [{ data: budgetRow, error: budgetError }, { data: partRows }] = await Promise.all([
    supabase.from("project_budget_rows").select("*").eq("id", id).maybeSingle(),
    supabase.from("part_budget_rows").select("*").eq("project_id", id).order("part_name"),
  ]);

  // budget_items carries its own RLS (view_budget for client-facing item types; ADDITIONALLY
  // view_internal_cost for planned_cost/actual_cost) -- so a non-finance viewer simply never
  // gets cost-type rows back here, no extra filtering required on our part.
  const { data: budgets } = await supabase.from("budgets").select("id").eq("project_id", id);
  const budgetIds = (budgets ?? []).map((b) => b.id);
  const { data: items } = budgetIds.length
    ? await supabase
        .from("budget_items")
        .select("*")
        .in("budget_id", budgetIds)
        .order("occurred_on", { ascending: false })
    : { data: [] as BudgetItemRow[] };

  const parts = (partRows ?? []) as PartBudgetRow[];
  const allItems = (items ?? []) as BudgetItemRow[];
  const changes = allItems.filter((item) => item.item_type === "change");
  // Everything except 'change' -- invoices/payments (client-facing) and planned/actual cost
  // (finance-only, already withheld by RLS from anyone else) -- rendered in a separate ledger
  // (BudgetItemsList) so 'change' keeps its own dedicated history card.
  const nonChangeItems = allItems.filter((item) => item.item_type !== "change");
  const monthlyBreakdown = buildMonthlyBreakdown(allItems);

  const row = budgetRow as ProjectBudgetRow | null;
  const hasFinanceVisibility = row?.margin !== null && row?.margin !== undefined;
  const plannedCostTotal = hasFinanceVisibility
    ? monthlyBreakdown.reduce((sum, r) => sum + r.plannedCost, 0)
    : null;
  const actualCostTotal = hasFinanceVisibility
    ? monthlyBreakdown.reduce((sum, r) => sum + r.actualCost, 0)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Budgets</h2>
        {/* The budget-entry home: gated purely on manage_budget, so finance (manage_budget:
            global, but no edit_project) can finally enter figures here even though the Parts
            tab's Add/Edit Part dialog remains gated on edit_project. */}
        {canManageBudget && (
          <BudgetItemFormDialog projectId={id} canManageCost={!!canManageCost} />
        )}
      </div>

      {budgetError || !row ? (
        <p className="text-destructive">Failed to load budget data. Try again.</p>
      ) : (
        <>
          <BudgetSummary row={row} />
          <BudgetPartsTable
            projectId={id}
            parts={parts}
            canManageBudget={!!canManageBudget}
            canManageCost={!!canManageCost}
          />
          <BudgetPlanVsActual
            clientAmount={row.client_amount}
            invoiced={row.invoiced}
            plannedCost={plannedCostTotal}
            actualCost={actualCostTotal}
          />
          <BudgetForecast invoiced={row.invoiced} progress={project.progress} />
          <BudgetMonthlyTable rows={monthlyBreakdown} />
          <BudgetItemsList projectId={id} items={nonChangeItems} canManageBudget={!!canManageBudget} />
          <BudgetChanges projectId={id} changes={changes} canManageBudget={!!canManageBudget} />
        </>
      )}
    </div>
  );
}
