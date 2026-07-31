import { ChartCard, ChartEmptyState } from "@/components/charts/chart-card";
import { BudgetSpentChart, type BudgetSpentRow } from "@/components/charts/budget-spent-chart";
import { CapacityChart, type CapacityRow } from "@/components/charts/capacity-chart";

// Snapshot charts only ("as of now", not windowed by the period selector) -- the time-series
// "Over time" group (hours logged, internal cost) moved out of this section in the reports v2
// rebuild: hours-over-time + top-projects now live on page.tsx (Task 3, hours-over-time-card.tsx +
// project-hours-donut.tsx), and Task 4 replaces the internal-cost chart with a combined monthly
// invoiced/cost line chart. Finance charts (budget spent) are null for a viewer without visibility
// and omitted -- never rendered zeroed.
export function ChartsSection({
  budgetSpent,
  capacity,
}: {
  budgetSpent: BudgetSpentRow[] | null;
  capacity: CapacityRow[];
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">Right now</h2>
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        {budgetSpent && (
          <ChartCard title="Budget spent vs remaining" description="Invoiced vs remaining, largest budgets first">
            {budgetSpent.length === 0 ? <ChartEmptyState /> : <BudgetSpentChart rows={budgetSpent} />}
          </ChartCard>
        )}
        <ChartCard title="Capacity vs allocation" description="Allocated hours against weekly capacity, most booked first">
          {capacity.length === 0 ? <ChartEmptyState /> : <CapacityChart rows={capacity} />}
        </ChartCard>
      </div>
    </div>
  );
}
