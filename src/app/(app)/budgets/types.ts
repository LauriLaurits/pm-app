import type { Database } from "@/lib/database.types";

// project_budget_rows (security_invoker view, migration 20260716000005): client-facing columns
// (client_amount/invoiced/paid/remaining/consumption_pct) are `view_budget`-gated; internal_cost/
// margin/margin_pct are `view_internal_cost`-gated (finance only) and NULL otherwise. Never
// re-derive margin here from a separately fetched cost -- consume the view's columns as-is.
export type ProjectBudgetRow = Database["public"]["Views"]["project_budget_rows"]["Row"];
export type BudgetType = Database["public"]["Enums"]["budget_type"];

export const BUDGET_TYPE_OPTIONS: BudgetType[] = ["fixed", "hourly", "mixed"];

export type SeverityFilter = "all" | "at_risk" | "over";

export const SEVERITY_FILTER_OPTIONS: SeverityFilter[] = ["all", "at_risk", "over"];

export const SEVERITY_FILTER_LABEL: Record<SeverityFilter, string> = {
  all: "All projects",
  at_risk: "At risk (75%+)",
  over: "Over budget (100%+)",
};

export function humanize(value: string) {
  return value.replace(/_/g, " ");
}
