import { ChartCard, ChartEmptyState } from "@/components/charts/chart-card";
import { BudgetSpentChart, type BudgetSpentRow } from "@/components/charts/budget-spent-chart";
import { MonthlyCostChart, type MonthlyCostPoint } from "@/components/charts/monthly-cost-chart";
import { CapacityChart, type CapacityRow } from "@/components/charts/capacity-chart";
import { ProjectStatusChart, type ProjectStatusCount } from "@/components/charts/project-status-chart";
import {
  PlannedActualHoursChart,
  type PlannedActualRow,
} from "@/components/charts/planned-actual-hours-chart";

// Gating lives entirely in what page.tsx passes in: `budgetSpent`/`monthlyCost` are `null` when
// the viewer has no view_budget / view_internal_cost visibility at all, and the whole panel is
// omitted -- never rendered with an empty/zeroed chart implying "$0 budget" or "no cost". The
// other three charts (capacity, project status, planned-vs-actual hours) aren't finance-sensitive
// so they always render, falling back to an empty state only when there's literally no data.
export function ChartsSection({
  budgetSpent,
  monthlyCost,
  capacity,
  statusCounts,
  plannedActual,
}: {
  budgetSpent: BudgetSpentRow[] | null;
  monthlyCost: MonthlyCostPoint[] | null;
  capacity: CapacityRow[];
  statusCounts: ProjectStatusCount[];
  plannedActual: PlannedActualRow[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {budgetSpent && (
        <ChartCard title="Budget spent vs remaining" description="Invoiced vs remaining, largest budgets first">
          {budgetSpent.length === 0 ? <ChartEmptyState /> : <BudgetSpentChart rows={budgetSpent} />}
        </ChartCard>
      )}
      {monthlyCost && (
        <ChartCard title="Monthly internal cost" description="Actual cost by month — visible to finance only">
          {monthlyCost.every((p) => p.cost === 0) ? (
            <ChartEmptyState />
          ) : (
            <MonthlyCostChart points={monthlyCost} />
          )}
        </ChartCard>
      )}
      <ChartCard title="Capacity vs allocation" description="Allocated hours against weekly capacity, most booked first">
        {capacity.length === 0 ? <ChartEmptyState /> : <CapacityChart rows={capacity} />}
      </ChartCard>
      <ChartCard title="Project status distribution" description="Count of projects per lifecycle status">
        {statusCounts.every((s) => s.count === 0) ? (
          <ChartEmptyState />
        ) : (
          <ProjectStatusChart data={statusCounts} />
        )}
      </ChartCard>
      <ChartCard
        title="Planned vs actual hours"
        description="Estimated hours vs logged hours, last 6 months, largest first"
      >
        {plannedActual.length === 0 ? <ChartEmptyState /> : <PlannedActualHoursChart rows={plannedActual} />}
      </ChartCard>
    </div>
  );
}
