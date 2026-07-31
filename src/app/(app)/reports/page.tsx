import Link from "next/link";
import { Clock, FileText, PiggyBank, Users, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/budget";
import { projectIconKey, type ProjectIconKey } from "@/lib/project-icons";
import { StatCard } from "@/components/stat-card";
import { ChartCard, ChartEmptyState } from "@/components/charts/chart-card";
import { MonthlyFinanceChart } from "@/components/charts/monthly-finance-chart";
import { ProjectHoursDonut } from "@/components/charts/project-hours-donut";
import type { ProjectBudgetRow } from "../dashboard/types";
import { CapacityCard } from "./capacity-card";
import { ExportButton } from "./export-button";
import { HoursOverTimeCard } from "./hours-over-time-card";
import { PerformanceTable } from "./performance-table";
import {
  buildCapacityRows,
  buildMonthlyFinance,
  buildMonthlyHours,
  buildPerformanceRows,
  buildProjectHoursSlices,
  buildReportsKpis,
  buildUtilizationRows,
  hoursByProjectForWindow,
  reportsWindow,
} from "./compute";
import { PERIOD_OPTIONS, PeriodSelector, type PeriodMonths } from "./period-selector";
import { fetchReportsBase } from "./queries";
import type { TrendDelta } from "./types";
import { UtilizationCard } from "./utilization-card";

// Period-over-period delta -> a KPI tile's context line + tone. `invertGood` flips which
// direction reads as "good" (emerald) vs "bad" (red) -- hours/invoiced going UP is good, cost
// going UP is bad, so the cost tile passes invertGood=true while everything else uses the
// default. A flat or absent delta (no prior-period data, or genuinely unchanged) always renders
// the same muted dash, never a fake 0%/arrow.
function deltaContext(
  delta: TrendDelta,
  months: number,
  invertGood = false
): { text: string; className: string } {
  if (!delta || delta.direction === "flat") {
    return { text: "— vs previous period", className: "text-muted-foreground" };
  }
  const arrow = delta.direction === "up" ? "↑" : "↓";
  const isGood = invertGood ? delta.direction === "down" : delta.direction === "up";
  return {
    text: `${arrow} ${Math.abs(Math.round(delta.pct))}% vs previous ${months} months`,
    className: isGood ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
  };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string }>;
}) {
  const { months: monthsParam } = await searchParams;
  // Whitelist 3|6|12, default 6 -- validated here BEFORE reportsWindow ever sees it (it trusts its
  // input), same one-liner the page already used for the pre-v2 chart section.
  const months: PeriodMonths = (PERIOD_OPTIONS as readonly number[]).includes(Number(monthsParam))
    ? (Number(monthsParam) as PeriodMonths)
    : 6;

  const supabase = await createClient();
  const todayISO = new Date().toISOString().slice(0, 10);
  const window = reportsWindow(months, todayISO);

  // fetchReportsBase is the whole page's data layer (Task 1) -- KPI row, CSV export, hours-over-
  // time/top-projects charts, and (Task 4) the utilization/capacity/monthly-finance row below all
  // bucket the same reportsBase reads. The pre-v2 ChartsSection's separate fetchDashboardBase read
  // (project_budget_rows + person_workload_rows, duplicated here just to feed the now-deleted
  // computeBudgetSpentChart/computeCapacityChart) is gone -- reportsBase.budgetRows/people are the
  // same RLS-gated views, so nothing lost, one fewer round trip.
  const reportsBase = await fetchReportsBase(supabase, window);

  const hasError = Boolean(reportsBase.budgetError || reportsBase.peopleError);

  // Every *_rows view marks every column nullable in the generated types (typical for Postgres
  // views), but `id`/`name` are the underlying tables' NOT NULL columns and are never actually
  // null -- filter defensively once here so every downstream compute() helper can rely on plain
  // `string`, same pattern as the dashboard page.
  const reportsBudgetRows = reportsBase.budgetRows.filter(
    (r): r is ProjectBudgetRow & { id: string; name: string } => r.id !== null && r.name !== null
  );
  const reportsPeople = reportsBase.people.filter(
    (p): p is (typeof reportsBase.people)[number] & { id: string; full_name: string } =>
      p.id !== null && p.full_name !== null
  );

  // computeSummary was reworked (Task 2 of the dashboard rebuild) to the dashboard's 5-tile
  // action-first shape and no longer carries budget/finance visibility -- those figures moved into
  // computeFinanceOverview, a dashboard-page concern. /reports only ever needed the two visibility
  // booleans, so it computes them itself (same one-liners computeSummary used internally) instead
  // of depending on a shape that isn't its own.
  const hasBudgetVisibility = reportsBudgetRows.some((r) => r.client_amount !== null);
  const hasFinanceVisibility = reportsBudgetRows.some((r) => r.internal_cost !== null);

  // Reports v2 KPI row + CSV export data. hoursByProjectForWindow/buildPerformanceRows only need
  // the CURRENT window's hours (buildReportsKpis re-derives current/previous itself from the full
  // [prevStart, end) read) -- nothing here re-queries time_entries, every builder below buckets
  // the same reportsBase.timeEntries array Task 1 already fetched once.
  const kpis = buildReportsKpis({
    window,
    timeEntries: reportsBase.timeEntries,
    budgetItems: reportsBase.budgetItems,
    budgetRows: reportsBudgetRows,
    people: reportsPeople,
    hasBudgetVisibility,
    hasFinanceVisibility,
  });
  const hoursByProject = hoursByProjectForWindow(reportsBase.timeEntries, window);
  const performanceRows = buildPerformanceRows(reportsBudgetRows, hoursByProject);

  // Same `id, tags` -> icon-key resolution budgets/page.tsx and projects/page.tsx already do --
  // the performance table's identity cell needs an icon tile and project_budget_rows carries no
  // tags of its own.
  const iconKeys: Record<string, ProjectIconKey> = {};
  for (const p of reportsBase.projects) {
    if (p.id) iconKeys[p.id] = projectIconKey(p.tags);
  }

  // Hours-over-time chart + top-projects donut. nameById resolves each project_id to its budget
  // row's name (every project with time entries should also have a project_budget_rows row --
  // buildProjectHoursSlices falls back to "Unknown project" otherwise), per Task 1's carried note.
  const monthlyHoursPoints = buildMonthlyHours(reportsBase.timeEntries, window);
  const nameById = Object.fromEntries(reportsBudgetRows.map((r) => [r.id, r.name]));
  const hoursSlices = buildProjectHoursSlices(reportsBase.timeEntries, window, nameById);

  // Middle row: Budget utilization (top 6 by consumption) + Capacity vs allocation (top 8 by
  // allocation) + Monthly financial overview (invoiced/cost lines). Utilization rows and the
  // finance points are cheap to compute unconditionally (pure), but the CARDS themselves are only
  // mounted below when hasBudgetVisibility -- invoiced (both the utilization list and the finance
  // chart's Invoiced line) needs budget visibility, never rendered zeroed for a viewer without it.
  // Capacity is ungated, same as the pre-v2 CapacityChart it replaces.
  const utilizationRows = buildUtilizationRows(reportsBudgetRows);
  const capacityRows = buildCapacityRows(reportsPeople);
  const monthlyFinancePoints = buildMonthlyFinance(reportsBase.budgetItems, window, hasFinanceVisibility);
  const financeIsEmpty = monthlyFinancePoints.every((p) => p.invoiced === 0 && (p.cost === null || p.cost === 0));

  // Budget-remaining tile's "% of portfolio" context -- same ratio convention as the Budgets page
  // (src/app/(app)/budgets/page.tsx's remainingPct), computed locally since ReportsKpis only
  // carries the raw remaining total, not a pre-baked share.
  const totalBudget = hasBudgetVisibility
    ? reportsBudgetRows.filter((r) => r.client_amount !== null).reduce((s, r) => s + (r.client_amount ?? 0), 0)
    : null;
  const remainingPct =
    totalBudget && kpis.budgetRemaining !== null ? (kpis.budgetRemaining / totalBudget) * 100 : null;

  const hoursContext = deltaContext(kpis.hoursDelta, window.months);
  const invoicedContext = deltaContext(kpis.invoicedDelta, window.months);
  const costContext = deltaContext(kpis.costDelta, window.months, true); // inverted: more cost = bad

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">
            Deep insights into hours, budget, and capacity trends over time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSelector active={months} label={window.label} />
          <ExportButton
            rows={performanceRows}
            startISO={window.startISO}
            endISO={window.endISO}
            label={window.label}
          />
        </div>
      </div>

      {hasError ? (
        <p className="text-destructive">Failed to load reports. Try again.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatCard
              icon={Clock}
              label="Total hours logged"
              value={`${Math.round(kpis.totalHours).toLocaleString("en-US")} h`}
              iconClass="bg-blue-500/10 text-blue-600 dark:text-blue-400"
              context={hoursContext.text}
              contextClass={hoursContext.className}
            />
            {kpis.totalInvoiced !== null && (
              <StatCard
                icon={FileText}
                label="Total invoiced"
                value={formatMoney(kpis.totalInvoiced)}
                iconClass="bg-sky-500/10 text-sky-600 dark:text-sky-400"
                context={invoicedContext.text}
                contextClass={invoicedContext.className}
              />
            )}
            {kpis.totalCost !== null && (
              <StatCard
                icon={Wallet}
                label="Total cost"
                value={formatMoney(kpis.totalCost)}
                iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                context={costContext.text}
                contextClass={costContext.className}
              />
            )}
            {kpis.budgetRemaining !== null && (
              <StatCard
                icon={PiggyBank}
                label="Budget remaining"
                value={formatMoney(kpis.budgetRemaining)}
                iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                context={remainingPct === null ? undefined : `${remainingPct.toFixed(1)}% of portfolio`}
              />
            )}
            <StatCard
              icon={Users}
              label="Avg utilization"
              value={`${Math.round(kpis.avgUtilization)}%`}
              iconClass="bg-rose-500/10 text-rose-600 dark:text-rose-400"
              context={kpis.availableInfo}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <HoursOverTimeCard points={monthlyHoursPoints} />
            </div>
            <ChartCard
              title="Top projects by hours"
              description="Share of hours logged this window"
              action={
                <Link href="/projects" className="text-sm font-medium text-muted-foreground hover:text-foreground">
                  View all
                </Link>
              }
            >
              {hoursSlices.length === 0 ? <ChartEmptyState /> : <ProjectHoursDonut slices={hoursSlices} />}
            </ChartCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            {hasBudgetVisibility && <UtilizationCard rows={utilizationRows} />}
            <CapacityCard rows={capacityRows} />
            {hasBudgetVisibility && (
              <ChartCard title="Monthly financial overview" description="Invoiced vs internal cost, by month">
                {financeIsEmpty ? <ChartEmptyState /> : <MonthlyFinanceChart points={monthlyFinancePoints} />}
              </ChartCard>
            )}
          </div>

          <ChartCard
            title="Project performance summary"
            description="Budget, hours, and margin per project, this window"
          >
            {/* SafeRow discipline: only the allowlisted PerformanceRow[] (already the compute
                output, see reports/compute.ts's buildPerformanceRows) + the icon-key map cross the
                client boundary -- never a raw project_budget_rows view row. hasFinanceVisibility
                is what gates the Cost/Margin columns OFF entirely (never rendered blank). */}
            <PerformanceTable
              rows={performanceRows}
              iconKeys={iconKeys}
              hasFinanceVisibility={hasFinanceVisibility}
            />
          </ChartCard>
        </>
      )}
    </div>
  );
}
