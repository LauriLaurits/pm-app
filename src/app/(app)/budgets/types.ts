import type { Database } from "@/lib/database.types";
import { consumptionSeverity } from "@/lib/budget";

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

// Coarse status pill for the portfolio table's Status column (mockup-driven) -- a simpler
// triage signal than ConsumptionCell's 4-tier bar. Reuses consumptionSeverity's thresholds
// verbatim (never forks them): "over" stays red, the "high" (90-99%) tier reads orange "At
// risk" (same tier->color mapping as CONSUMPTION_BADGE_CLASS.high in lib/budget.ts -- amber is
// the "warn", 75-89%, tier there, not "high"), everything else (ok + the 75-89% "warn" tier)
// reads green "On track". Checked against the current at_risk/over severity filter above: both
// derive from the same consumptionSeverity call and, across every currently-seeded budget row,
// agree (no row lands in the 75-89% "warn" band today) -- if one ever does, the "At risk (75%+)"
// filter chip would surface it while this pill reads "On track", which is worth revisiting then.
//
// "no_budget" (client_amount === null) is deliberately NOT rendered as an affirmative status
// anywhere -- project_budget_rows (migration 20260716000005) collapses two very different cases
// into the same NULL: a project that genuinely has no budget set, and a project this viewer
// simply can't see (view_budget is `own_projects`-scoped for the project_manager role, i.e.
// PER-PROJECT, so one PM's portfolio can legitimately mix visible and RLS-hidden rows -- see
// has_permission's own_projects branch in 20260715000003_projects.sql). The view's own comment
// is explicit that this null must never read as a real "no budget" claim, only as "you can't see
// this" -- so budget-portfolio-table.tsx renders the SAME plain muted dash every other gated cell
// in this row already uses for that null (ConsumptionCell/MarginCell), never a "No budget" badge.
// budgetStatus() still returns "no_budget" for null rows purely so the Status column's sort keeps
// pushing them last (BUDGET_STATUS_RANK) -- that value is never used to pick a rendered label.
export type BudgetStatus = "no_budget" | "over" | "at_risk" | "on_track";

export function budgetStatus(
  row: Pick<ProjectBudgetRow, "client_amount" | "consumption_pct">
): BudgetStatus {
  if (row.client_amount === null) return "no_budget";
  const severity = consumptionSeverity(row.consumption_pct);
  if (severity === "over") return "over";
  if (severity === "high") return "at_risk";
  return "on_track";
}

// Sort rank for the Status column -- worst-first, matching the table's default consumption sort.
export const BUDGET_STATUS_RANK: Record<BudgetStatus, number> = {
  over: 0,
  at_risk: 1,
  on_track: 2,
  no_budget: 3,
};

// "no_budget" has no label -- it never reaches a Badge (see the block comment above), so it's
// intentionally excluded rather than paired with a string nothing will render.
export const BUDGET_STATUS_LABEL: Record<Exclude<BudgetStatus, "no_budget">, string> = {
  over: "Over budget",
  at_risk: "At risk",
  on_track: "On track",
};

// Same light+dark-safe border/bg/text triplet as CONSUMPTION_BADGE_CLASS -- "at_risk" uses the
// ORANGE tint (CONSUMPTION_BADGE_CLASS.high), matching the "high" severity tier it derives from;
// amber is reserved for "warn" in that shared convention, which this pill folds into on_track.
export const BUDGET_STATUS_BADGE_CLASS: Record<Exclude<BudgetStatus, "no_budget">, string> = {
  over: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  at_risk: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  on_track: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};
