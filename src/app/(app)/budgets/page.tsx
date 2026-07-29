import { Banknote, PiggyBank, Receipt, TrendingUp, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { consumptionSeverity, formatMoney, marginPct } from "@/lib/budget";
import { projectIconKey, type ProjectIconKey } from "@/lib/project-icons";
import { StatCard } from "@/components/stat-card";
import { BudgetPortfolioTable } from "./budget-portfolio-table";
import type { ProjectBudgetRow } from "./types";

export default async function BudgetsPage() {
  const supabase = await createClient();

  // One RLS-scoped read of the whole portfolio: `project_budget_rows` is a security_invoker view
  // (migration 20260716000005), so client_amount/invoiced/paid/remaining/consumption_pct are only
  // populated for callers with view_budget, and internal_cost/margin/margin_pct only for callers
  // with view_internal_cost -- both already nulled by RLS before this ever reaches the server
  // component. Never re-derive margin here; only read the columns the view already gated.
  // Client-name -> id (second query) is for the client sublink (the budget view carries names
  // only). RLS-scoped: viewers without the clients permission get zero rows and the names render
  // unlinked. The third query is the same lightweight `id, tags` read projects/page.tsx does for
  // the identity-cell icon tile -- the budget view doesn't carry tags, so it's resolved here.
  // All three reads are independent, so they run as one parallel round trip (perf feedback:
  // sequential awaits each added a full DB round trip to TTFB).
  const [{ data, error }, { data: clientRefs }, { data: projectRefs }] = await Promise.all([
    supabase
      .from("project_budget_rows")
      .select("*")
      .order("consumption_pct", { ascending: false, nullsFirst: false }),
    supabase.from("clients").select("id, name"),
    supabase.from("projects").select("id, tags"),
  ]);

  const rows = (data ?? []) as ProjectBudgetRow[];
  const clientIdByName: Record<string, string> = {};
  for (const c of clientRefs ?? []) clientIdByName[c.name] = c.id;
  const iconKeys: Record<string, ProjectIconKey> = {};
  for (const p of projectRefs ?? []) iconKeys[p.id] = projectIconKey(p.tags);

  // Card/subtitle totals are computed across the FULL portfolio -- filtering (search + severity)
  // lives entirely client-side inside BudgetPortfolioTable and never reaches these numbers, so a
  // search or severity chip narrows the rows without ever touching the tiles above them. Each sum
  // only runs over rows where the relevant tier is actually visible to this viewer, so a member
  // (no view_budget anywhere) gets "—" cards rather than a misleading zero.
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

  // Total internal cost sums EVERY project whose cost the viewer can see (view_internal_cost),
  // independent of whether that project also has client billing -- a cost-only project (cost but
  // no billing row) still counts. Blended margin, by contrast, is only meaningful over projects
  // that have BOTH client amount and cost, so it uses the margin-paired subset.
  const costRows = rows.filter((row) => row.internal_cost !== null);
  const hasFinanceVisibility = costRows.length > 0;
  const totalInternalCost = hasFinanceVisibility
    ? costRows.reduce((sum, row) => sum + (row.internal_cost ?? 0), 0)
    : null;

  const marginRows = rows.filter((row) => row.margin !== null && row.client_amount !== null);
  const totalMargin = marginRows.length > 0
    ? marginRows.reduce((sum, row) => sum + (row.margin ?? 0), 0)
    : null;
  const totalClientAmountForMargin = marginRows.length > 0
    ? marginRows.reduce((sum, row) => sum + (row.client_amount ?? 0), 0)
    : null;
  const blendedMarginPct = marginPct(totalMargin, totalClientAmountForMargin);

  // Subtitle-strip counts, same "at risk is inclusive of over" semantics as the table's severity
  // facet: at_risk = >=75% consumption (including the >=100% over-budget rows), over = strictly
  // >=100%. Portfolio-wide (unfiltered), like every number above.
  const overCount = rows.filter((r) => consumptionSeverity(r.consumption_pct) === "over").length;
  const atRiskCount = rows.filter((r) => consumptionSeverity(r.consumption_pct) !== "ok").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Budgets</h1>
          {rows.length > 0 && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {rows.length} project{rows.length === 1 ? "" : "s"}
              <span className="mx-1.5 text-border">·</span>
              {overCount} over budget
              <span className="mx-1.5 text-border">·</span>
              {atRiskCount} at risk
              {totalClientAmount !== null && (
                <>
                  <span className="mx-1.5 text-border">·</span>
                  {formatMoney(totalClientAmount)} portfolio
                </>
              )}
            </p>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatCard
            icon={Wallet}
            label="Portfolio value"
            value={formatMoney(totalClientAmount)}
            iconClass="bg-blue-500/10 text-blue-600 dark:text-blue-400"
          />
          <StatCard
            icon={Receipt}
            label="Invoiced"
            value={formatMoney(totalInvoiced)}
            iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          />
          <StatCard
            icon={PiggyBank}
            label="Remaining"
            value={formatMoney(totalRemaining)}
            iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
          />
          {hasFinanceVisibility && (
            <>
              <StatCard
                icon={Banknote}
                label="Internal cost"
                value={formatMoney(totalInternalCost)}
                iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-400"
              />
              <StatCard
                icon={TrendingUp}
                label="Margin"
                value={
                  blendedMarginPct === null
                    ? formatMoney(totalMargin)
                    : `${formatMoney(totalMargin)} · ${blendedMarginPct.toFixed(1)}%`
                }
                iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              />
            </>
          )}
        </div>
      )}

      {error ? (
        <p className="text-destructive">Failed to load budgets. Try again.</p>
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <BudgetPortfolioTable rows={rows} clientIdByName={clientIdByName} iconKeys={iconKeys} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
      No budgets yet.
    </div>
  );
}
