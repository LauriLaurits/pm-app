import type { BudgetSpentRow } from "@/components/charts/budget-spent-chart";
import type { CapacityRow } from "@/components/charts/capacity-chart";
import type { ValidBudgetRow, ValidPerson } from "../dashboard/types";

const CHART_TOP_N = 6;
const CAPACITY_TOP_N = 8;

// ---- charts ----
export function computeBudgetSpentChart(budgetRows: ValidBudgetRow[], hasBudgetVisibility: boolean) {
  if (!hasBudgetVisibility) return null;
  return budgetRows
    .filter((r) => r.client_amount !== null)
    .sort((a, b) => (b.client_amount ?? 0) - (a.client_amount ?? 0))
    .slice(0, CHART_TOP_N)
    .map((r): BudgetSpentRow => ({ id: r.id, name: r.name, invoiced: r.invoiced ?? 0, remaining: Math.max(r.remaining ?? 0, 0) }));
}

export function computeCapacityChart(people: ValidPerson[]): CapacityRow[] {
  return people
    .sort((a, b) => (b.current_allocation_pct ?? 0) - (a.current_allocation_pct ?? 0))
    .slice(0, CAPACITY_TOP_N)
    .map((p) => {
      const capacityHours = Number(p.weekly_capacity_hours ?? 0);
      const allocatedHours = Math.round(((p.current_allocation_pct ?? 0) / 100) * capacityHours * 10) / 10;
      return { id: p.id, name: p.full_name, capacityHours, allocatedHours };
    });
}
