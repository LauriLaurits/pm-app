// Pure utilization-class mapping shared by the People directory and (later) the Workload
// timeline. Spec: 0-49% available, 50-89% partial, 90-100% full, >100% overallocated.
// Colors follow the same light+dark-safe badge approach as HEALTH_BADGE_CLASS in
// src/app/(app)/projects/types.ts: border/bg/text triplets, distinct per class.

export type UtilizationClass = "available" | "partial" | "full" | "overallocated";

export function utilizationClass(pct: number): UtilizationClass {
  if (pct > 100) return "overallocated";
  if (pct >= 90) return "full";
  if (pct >= 50) return "partial";
  return "available";
}

export const UTILIZATION_LABEL: Record<UtilizationClass, string> = {
  available: "Available",
  partial: "Partial",
  full: "Full",
  overallocated: "Overallocated",
};

export function utilizationLabel(pct: number): string {
  return UTILIZATION_LABEL[utilizationClass(pct)];
}

export const UTILIZATION_BADGE_CLASS: Record<UtilizationClass, string> = {
  available:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  partial: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  full: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  overallocated: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
};

export function utilizationBadgeClasses(pct: number): string {
  return UTILIZATION_BADGE_CLASS[utilizationClass(pct)];
}

// Progress-bar fill classes for the Employees list's Workload column -- solid fills (not
// tinted borders) so utilization severity reads at a glance, mirroring CONSUMPTION_BAR_CLASS
// in src/lib/budget.ts (the projects list's budget bar).
export const UTILIZATION_BAR_CLASS: Record<UtilizationClass, string> = {
  available: "bg-emerald-500",
  partial: "bg-blue-500",
  full: "bg-amber-500",
  overallocated: "bg-red-600",
};

export function utilizationBarClasses(pct: number): string {
  return UTILIZATION_BAR_CLASS[utilizationClass(pct)];
}

// Cell-background classes for the Workload timeline grid -- deliberately louder than the badge
// tints above (solid-ish fills, not just a border) so an overallocated week reads as visually
// loud at a glance, per the task brief. Free (0%) gets its own near-invisible treatment distinct
// from "available" (1-49%) so truly empty weeks are the easiest thing on the screen to spot.
export const UTILIZATION_CELL_CLASS: Record<UtilizationClass, string> = {
  available: "bg-emerald-500/25 dark:bg-emerald-500/30",
  partial: "bg-blue-500/40 dark:bg-blue-500/45",
  full: "bg-amber-500/55 dark:bg-amber-500/55",
  overallocated: "bg-red-600/80 dark:bg-red-500/80",
};
export const UTILIZATION_CELL_EMPTY_CLASS = "bg-muted/40 dark:bg-muted/20";

export function utilizationCellClasses(pct: number): string {
  if (pct <= 0) return UTILIZATION_CELL_EMPTY_CLASS;
  return UTILIZATION_CELL_CLASS[utilizationClass(pct)];
}

// Monday-anchored week_start dates for the Workload timeline window, matching the SQL function
// `public.person_weekly_allocation`'s `date_trunc('week', p_from)` anchoring so the header labels
// line up exactly with the rows returned per-person. Pure + unit-tested (no DB round trip needed
// just to lay out the grid header).
export function weekStartsFrom(from: Date, weeks: number): string[] {
  const monday = new Date(from);
  const day = monday.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  monday.setUTCDate(monday.getUTCDate() + diffToMonday);
  monday.setUTCHours(0, 0, 0, 0);

  const count = Math.max(weeks, 1);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + i * 7);
    return d.toISOString().slice(0, 10);
  });
}
