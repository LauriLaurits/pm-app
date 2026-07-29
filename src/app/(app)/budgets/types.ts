import type { Database } from "@/lib/database.types";

// project_budget_rows (security_invoker view, migration 20260716000005): client-facing columns
// (client_amount/invoiced/paid/remaining/consumption_pct) are `view_budget`-gated; internal_cost/
// margin/margin_pct are `view_internal_cost`-gated (finance only) and NULL otherwise. Never
// re-derive margin here from a separately fetched cost -- consume the view's columns as-is.
export type ProjectBudgetRow = Database["public"]["Views"]["project_budget_rows"]["Row"];
export type BudgetType = Database["public"]["Enums"]["budget_type"];

export function humanize(value: string) {
  return value.replace(/_/g, " ");
}

// Client-side severity facet for the portfolio table (see budget-portfolio-table.tsx). "at_risk"
// is INCLUSIVE of "over" (both are >=75% consumption) -- same semantics the filter always had.
export type SeverityFacet = "at_risk" | "over";

export const SEVERITY_FACET_OPTIONS: SeverityFacet[] = ["at_risk", "over"];

export const SEVERITY_FACET_LABEL: Record<SeverityFacet, string> = {
  at_risk: "At risk (75%+)",
  over: "Over budget (100%+)",
};

// Dot idiom per the task brief: at-risk amber-400, over red-500 (same palette family as
// STATUS_FILTER_DOT in people-table.tsx / DERIVED_HEALTH_DOT).
export const SEVERITY_FACET_DOT: Record<SeverityFacet, string> = {
  at_risk: "bg-amber-400",
  over: "bg-red-500",
};

/** Sentinel for "no severity filter applied" -- shared between BudgetFilters and
 * BudgetPortfolioTable so the two components agree on the unfiltered value. */
export const SEVERITY_ALL = "__all__" as const;
