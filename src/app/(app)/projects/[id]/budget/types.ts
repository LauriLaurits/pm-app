import type { Database } from "@/lib/database.types";

// project_budget_rows / part_budget_rows (security_invoker views, migrations 20260716000005 +
// 20260716000006): client-facing columns are `view_budget`-gated; internal cost/margin columns
// are `view_internal_cost`-gated (finance only) and NULL otherwise. Never re-derive margin here
// from a separately fetched cost -- consume the views' columns as-is.
export type ProjectBudgetRow = Database["public"]["Views"]["project_budget_rows"]["Row"];
export type PartBudgetRow = Database["public"]["Views"]["part_budget_rows"]["Row"];
export type BudgetItemRow = Database["public"]["Tables"]["budget_items"]["Row"];

// Sums a column across rows that are ALL visible or ALL hidden together for a given viewer (the
// views null out an entire financial tier uniformly, never row-by-row) -- so "every value is
// null" means "not visible to me" (-> null, not a fake 0), while a mix of real numbers sums
// normally treating any stray null as 0 (a part simply having no billing row yet).
export function sumOrNull(values: (number | null)[]): number | null {
  if (values.length === 0) return null;
  if (values.every((v) => v === null)) return null;
  return values.reduce((sum: number, v) => sum + (v ?? 0), 0);
}

export function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // YYYY-MM
}

export function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export function humanize(value: string) {
  return value.replace(/_/g, " ");
}

export type MonthlyBreakdownRow = {
  month: string;
  invoice: number;
  payment: number;
  change: number;
  plannedCost: number;
  actualCost: number;
};

// Groups budget_items by month(occurred_on). Cost-type rows (planned_cost/actual_cost) only
// ever appear here at all if the viewer has view_internal_cost -- the base table's own RLS
// ("view budget items" in 20260715000005_budgets.sql) already withholds those rows entirely
// from a non-finance caller, so this function never has to gate anything itself.
export function buildMonthlyBreakdown(items: BudgetItemRow[]): MonthlyBreakdownRow[] {
  const byMonth = new Map<string, MonthlyBreakdownRow>();
  for (const item of items) {
    const key = monthKey(item.occurred_on);
    const row = byMonth.get(key) ?? {
      month: key, invoice: 0, payment: 0, change: 0, plannedCost: 0, actualCost: 0,
    };
    if (item.item_type === "invoice") row.invoice += Number(item.amount);
    else if (item.item_type === "payment") row.payment += Number(item.amount);
    else if (item.item_type === "change") row.change += Number(item.amount);
    else if (item.item_type === "planned_cost") row.plannedCost += Number(item.amount);
    else if (item.item_type === "actual_cost") row.actualCost += Number(item.amount);
    byMonth.set(key, row);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}
