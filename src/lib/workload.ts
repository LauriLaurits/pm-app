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
