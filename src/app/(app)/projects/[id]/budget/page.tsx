import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BudgetSummary } from "./budget-summary";
import { BudgetPartsTable } from "./budget-parts-table";
import { BudgetPlanVsActual } from "./budget-plan-vs-actual";
import { BudgetForecast } from "./budget-forecast";
import { BudgetMonthlyTable } from "./budget-monthly-table";
import { BudgetChanges } from "./budget-changes";
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
      <h2 className="text-lg font-semibold">Budgets</h2>

      {budgetError || !row ? (
        <p className="text-destructive">Failed to load budget data. Try again.</p>
      ) : (
        <>
          <BudgetSummary row={row} />
          <BudgetPartsTable parts={parts} />
          <BudgetPlanVsActual
            clientAmount={row.client_amount}
            invoiced={row.invoiced}
            plannedCost={plannedCostTotal}
            actualCost={actualCostTotal}
          />
          <BudgetForecast invoiced={row.invoiced} progress={project.progress} />
          <BudgetMonthlyTable rows={monthlyBreakdown} />
          <BudgetChanges changes={changes} />
        </>
      )}
    </div>
  );
}
