import { ChartCard, ChartEmptyState } from "@/components/charts/chart-card";
import { BudgetSpentChart, type BudgetSpentRow } from "@/components/charts/budget-spent-chart";
import { MonthlyCostChart, type MonthlyCostPoint } from "@/components/charts/monthly-cost-chart";
import { CapacityChart, type CapacityRow } from "@/components/charts/capacity-chart";

// Three charts, each showing something a number can't: money split per project, the internal-cost
// trend over time (finance only), and who is over/under capacity. Gating lives in what page.tsx
// passes: the two finance charts are `null` for a viewer without budget/cost visibility and the
// whole card is omitted -- never rendered zeroed (which would read as "$0 budget"). Capacity always
// renders, falling back to an empty state only when there's literally no one to show.
export function ChartsSection({
  budgetSpent,
  monthlyCost,
  capacity,
}: {
  budgetSpent: BudgetSpentRow[] | null;
  monthlyCost: MonthlyCostPoint[] | null;
  capacity: CapacityRow[];
}) {
  return (
    // items-start so a short chart (few bars) keeps its natural height instead of stretching to
    // match a tall neighbour and leaving dead space.
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
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
    </div>
  );
}
