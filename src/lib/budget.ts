// Pure budget-math helpers shared by the portfolio budget dashboard (and, later, the per-project
// budget tab + main dashboard). No Supabase/DB access here on purpose: every number this module
// touches must already have come out of `project_budget_rows` (security_invoker, RLS-gated) --
// this file only classifies/formats numbers it's handed, it never computes margin itself.
//
// Consumption alert thresholds, per the phase plan: <75% ok, 75-89% warn, 90-99% high, >=100% over.

export type ConsumptionSeverity = "ok" | "warn" | "high" | "over";

export function consumptionSeverity(pct: number | null): ConsumptionSeverity {
  if (pct === null || pct === undefined) return "ok";
  if (pct >= 100) return "over";
  if (pct >= 90) return "high";
  if (pct >= 75) return "warn";
  return "ok";
}

export const CONSUMPTION_LABEL: Record<ConsumptionSeverity, string> = {
  ok: "On track",
  warn: "Approaching budget",
  high: "Near budget",
  over: "Over budget",
};

export function consumptionLabel(pct: number | null): string {
  return CONSUMPTION_LABEL[consumptionSeverity(pct)];
}

// Same light+dark-safe border/bg/text triplet approach as HEALTH_BADGE_CLASS
// (src/app/(app)/projects/types.ts) and UTILIZATION_BADGE_CLASS (src/lib/workload.ts).
export const CONSUMPTION_BADGE_CLASS: Record<ConsumptionSeverity, string> = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  high: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  over: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
};

export function consumptionBadgeClasses(pct: number | null): string {
  return CONSUMPTION_BADGE_CLASS[consumptionSeverity(pct)];
}

// Progress-bar fill classes -- solid fills (not just tinted borders) so the consumption bar's
// severity reads at a glance, mirroring UTILIZATION_CELL_CLASS in src/lib/workload.ts.
export const CONSUMPTION_BAR_CLASS: Record<ConsumptionSeverity, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  high: "bg-orange-500",
  over: "bg-red-600",
};

export function consumptionBarClasses(pct: number | null): string {
  return CONSUMPTION_BAR_CLASS[consumptionSeverity(pct)];
}

export function formatMoney(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

// Margin as a percent of client amount. Callers must pass numbers that already came out of the
// gated view (margin/client_amount are both null unless the viewer has view_internal_cost AND
// view_budget) -- this function does not gate anything itself, it just does the safe division.
export function marginPct(margin: number | null, clientAmount: number | null): number | null {
  if (margin === null || margin === undefined) return null;
  if (clientAmount === null || clientAmount === undefined || clientAmount === 0) return null;
  return (margin / clientAmount) * 100;
}
