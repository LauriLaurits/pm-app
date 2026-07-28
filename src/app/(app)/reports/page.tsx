import { createClient } from "@/lib/supabase/server";
import { monthLabel } from "@/lib/dashboard";
import { fetchDashboardBase } from "../dashboard/queries";
import type { ProjectBudgetRow } from "../dashboard/types";
import { ChartsSection } from "./charts-section";
import { computeBudgetSpentChart, computeCapacityChart } from "./compute";
import { PERIOD_OPTIONS, type PeriodMonths } from "./period-selector";
import { fetchMonthlyActualCosts, fetchMonthlyHours } from "./queries";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string }>;
}) {
  const { months: monthsParam } = await searchParams;
  const months: PeriodMonths = (PERIOD_OPTIONS as readonly number[]).includes(Number(monthsParam))
    ? (Number(monthsParam) as PeriodMonths)
    : 6;

  const supabase = await createClient();

  // fetchMonthlyHours only depends on the selected window, so it joins the base fetch wave. Only
  // the cost chart stays in a second wave -- it's gated on finance visibility, which is derived
  // from the base rows.
  const [base, monthlyHoursRaw] = await Promise.all([
    fetchDashboardBase(supabase),
    fetchMonthlyHours(supabase, months),
  ]);

  const hasError = Boolean(base.projectsError || base.budgetError || base.workloadError);

  // Every *_rows view marks every column nullable in the generated types (typical for Postgres
  // views), but `id`/`name` are the underlying tables' NOT NULL columns and are never actually
  // null -- filter defensively once here so every downstream compute() helper can rely on plain
  // `string`, same pattern as the dashboard page. (project_list_rows itself isn't needed here --
  // this page's charts only read budget/workload rows -- so only those two are filtered.)
  const budgetRows = base.budgetRows.filter(
    (r): r is ProjectBudgetRow & { id: string; name: string } => r.id !== null && r.name !== null
  );
  const people = base.workloadRows.filter(
    (p): p is (typeof base.workloadRows)[number] & { id: string; full_name: string } =>
      p.id !== null && p.full_name !== null
  );

  // computeSummary was reworked (Task 2) to the dashboard's 5-tile action-first shape and no
  // longer carries budget/finance visibility -- those figures moved into computeFinanceOverview,
  // a dashboard-page concern. /reports only ever needed the two visibility booleans, so it computes
  // them itself (same one-liners computeSummary used internally) instead of depending on a shape
  // that isn't its own.
  const hasBudgetVisibility = budgetRows.some((r) => r.client_amount !== null);
  const hasFinanceVisibility = budgetRows.some((r) => r.internal_cost !== null);

  const monthlyCostRaw = hasFinanceVisibility ? await fetchMonthlyActualCosts(supabase, months) : null;
  const monthlyCost = monthlyCostRaw?.map((p) => ({ month: monthLabel(p.month), cost: p.cost })) ?? null;
  const monthlyHours = monthlyHoursRaw.map((p) => ({
    month: monthLabel(p.month),
    billable: p.billable,
    nonBillable: p.nonBillable,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">
          The analytics behind the dashboard — hours, cost, budget, and capacity trends over time.
        </p>
      </div>

      {hasError ? (
        <p className="text-destructive">Failed to load reports. Try again.</p>
      ) : (
        <ChartsSection
          months={months}
          monthlyHours={monthlyHours}
          monthlyCost={monthlyCost}
          budgetSpent={computeBudgetSpentChart(budgetRows, hasBudgetVisibility)}
          capacity={computeCapacityChart(people)}
        />
      )}
    </div>
  );
}
