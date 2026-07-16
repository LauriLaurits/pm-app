import { createClient } from "@/lib/supabase/server";
import { consumptionSeverity, marginPct } from "@/lib/budget";
import { BudgetCards } from "./budget-cards";
import { BudgetFilters } from "./budget-filters";
import { BudgetPortfolioTable } from "./budget-portfolio-table";
import type { ProjectBudgetRow, SeverityFilter } from "./types";

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  // One RLS-scoped read of the whole portfolio: `project_budget_rows` is a security_invoker view
  // (migration 20260716000005), so client_amount/invoiced/paid/remaining/consumption_pct are only
  // populated for callers with view_budget, and internal_cost/margin/margin_pct only for callers
  // with view_internal_cost -- both already nulled by RLS before this ever reaches the server
  // component. Never re-derive margin here; only read the columns the view already gated.
  const { data, error } = await supabase
    .from("project_budget_rows")
    .select("*")
    .order("consumption_pct", { ascending: false, nullsFirst: false });

  const rows = (data ?? []) as ProjectBudgetRow[];

  const severity: SeverityFilter =
    params.severity === "at_risk" || params.severity === "over" ? params.severity : "all";
  const filteredRows = rows.filter((row) => {
    if (severity === "all") return true;
    const sev = consumptionSeverity(row.consumption_pct);
    return severity === "over" ? sev === "over" : sev !== "ok";
  });

  // Card totals are computed across the FULL visible portfolio (never the filtered subset) --
  // only over rows where the relevant tier is actually visible to this viewer, so a member (no
  // view_budget anywhere) gets "—" cards rather than a misleading zero.
  const budgetRows = rows.filter((row) => row.client_amount !== null);
  const totalClientAmount = budgetRows.length
    ? budgetRows.reduce((sum, row) => sum + (row.client_amount ?? 0), 0)
    : null;
  const totalInvoiced = budgetRows.length
    ? budgetRows.reduce((sum, row) => sum + (row.invoiced ?? 0), 0)
    : null;
  const totalRemaining = budgetRows.length
    ? budgetRows.reduce((sum, row) => sum + (row.remaining ?? 0), 0)
    : null;

  // margin is read straight off each row (already null-gated by the view) and summed -- never
  // recomputed from a separately-fetched internal cost.
  const financeRows = rows.filter((row) => row.margin !== null && row.client_amount !== null);
  const hasFinanceVisibility = financeRows.length > 0;
  const totalInternalCost = hasFinanceVisibility
    ? financeRows.reduce((sum, row) => sum + (row.internal_cost ?? 0), 0)
    : null;
  const totalMargin = hasFinanceVisibility
    ? financeRows.reduce((sum, row) => sum + (row.margin ?? 0), 0)
    : null;
  const totalClientAmountForMargin = hasFinanceVisibility
    ? financeRows.reduce((sum, row) => sum + (row.client_amount ?? 0), 0)
    : null;
  const blendedMarginPct = marginPct(totalMargin, totalClientAmountForMargin);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Budgets</h1>
      </div>

      <BudgetCards
        totalClientAmount={totalClientAmount}
        totalInvoiced={totalInvoiced}
        totalRemaining={totalRemaining}
        hasFinanceVisibility={hasFinanceVisibility}
        totalInternalCost={totalInternalCost}
        totalMargin={totalMargin}
        blendedMarginPct={blendedMarginPct}
      />

      <BudgetFilters current={severity} />

      {error ? (
        <p className="text-destructive">Failed to load budgets. Try again.</p>
      ) : rows.length === 0 ? (
        <EmptyState hasFilters={false} />
      ) : filteredRows.length === 0 ? (
        <EmptyState hasFilters />
      ) : (
        <BudgetPortfolioTable rows={filteredRows} />
      )}
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
      {hasFilters ? "No projects match this filter." : "No budgets yet."}
    </div>
  );
}
