import { createClient } from "@/lib/supabase/server";
import { monthLabel } from "@/lib/dashboard";
import { computeSummary } from "../dashboard/compute";
import { fetchDashboardBase } from "../dashboard/queries";
import type { ProjectBudgetRow, ProjectListRow } from "../dashboard/types";
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
  // `string`, same pattern as the dashboard page.
  const projects = base.projects.filter(
    (p): p is ProjectListRow & { id: string; name: string } => p.id !== null && p.name !== null
  );
  const budgetRows = base.budgetRows.filter(
    (r): r is ProjectBudgetRow & { id: string; name: string } => r.id !== null && r.name !== null
  );
  const people = base.workloadRows.filter(
    (p): p is (typeof base.workloadRows)[number] & { id: string; full_name: string } =>
      p.id !== null && p.full_name !== null
  );

  const summary = computeSummary(projects, budgetRows, people);

  const monthlyCostRaw = summary.finance ? await fetchMonthlyActualCosts(supabase, months) : null;
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
          budgetSpent={computeBudgetSpentChart(budgetRows, summary.hasBudgetVisibility)}
          capacity={computeCapacityChart(people)}
        />
      )}
    </div>
  );
}
