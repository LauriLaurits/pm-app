import { ChartCard, ChartEmptyState } from "@/components/charts/chart-card";
import { BudgetSpentChart, type BudgetSpentRow } from "@/components/charts/budget-spent-chart";
import { MonthlyCostChart, type MonthlyCostPoint } from "@/components/charts/monthly-cost-chart";
import { MonthlyHoursChart, type MonthlyHoursPoint } from "@/components/charts/monthly-hours-chart";
import { CapacityChart, type CapacityRow } from "@/components/charts/capacity-chart";
import { PeriodSelector, type PeriodMonths } from "./period-selector";

// Charts split into two groups: the time-series ones (hours logged, internal cost) respond to the
// period selector; the snapshot ones (budget spent, capacity) are always "as of now". The selector
// sits above the time-series group so it's clear what it governs. Finance charts (cost, budget
// spent) are null for a viewer without visibility and omitted -- never rendered zeroed.
export function ChartsSection({
  months,
  monthlyHours,
  monthlyCost,
  budgetSpent,
  capacity,
}: {
  months: PeriodMonths;
  monthlyHours: MonthlyHoursPoint[];
  monthlyCost: MonthlyCostPoint[] | null;
  budgetSpent: BudgetSpentRow[] | null;
  capacity: CapacityRow[];
}) {
  const window = `last ${months} months`;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Over time</h2>
        <PeriodSelector active={months} />
      </div>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        <ChartCard title="Hours logged per month" description={`Billable vs non-billable — ${window}`}>
          {monthlyHours.every((p) => p.billable === 0 && p.nonBillable === 0) ? (
            <ChartEmptyState />
          ) : (
            <MonthlyHoursChart points={monthlyHours} />
          )}
        </ChartCard>

        {monthlyCost && (
          <ChartCard title="Internal cost per month" description={`Actual cost — ${window} · finance only`}>
            {monthlyCost.every((p) => p.cost === 0) ? <ChartEmptyState /> : <MonthlyCostChart points={monthlyCost} />}
          </ChartCard>
        )}
      </div>

      <h2 className="pt-1 text-sm font-medium text-muted-foreground">Right now</h2>
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
