import { daysUntil } from "@/lib/dashboard";

// Project health is DERIVED, never hand-typed (same principle as progress in lib/progress.ts:
// a manual flag a PM must remember to update is always stale). Health answers "is anything
// threatening this project right now" from three signals the app already tracks:
//
//   critical -- deadline overdue, or budget fully used (>=100%)
//   warning  -- deadline within 14 days, budget nearly used (>=90%), or progress lagging the
//               elapsed timeline by more than 25 points (e.g. 80% of the time gone, 40% done)
//   healthy  -- none of the above. Completed/archived projects are always healthy (a past
//               deadline on a finished project is not a problem).
//
// Every triggered signal is returned as a human reason so the UI can show WHY, not just a color.

export type DerivedHealthLevel = "healthy" | "warning" | "critical";

export type DerivedHealth = {
  level: DerivedHealthLevel;
  /** Triggered signals, e.g. ["12 days overdue", "over budget (104%)"]. Empty when healthy. */
  reasons: string[];
};

const DUE_SOON_DAYS = 14;
const BUDGET_WARN_PCT = 90;
const SCHEDULE_LAG_PTS = 25;

export function deriveHealth(input: {
  status: string | null;
  startDate: string | null;
  deadline: string | null;
  /** Budget consumption % (invoiced/used of total), null when unknown or not visible. */
  consumptionPct: number | null;
  /** Parts-derived progress % (lib/progress), null when the project has no parts. */
  progressPct: number | null;
}): DerivedHealth {
  if (input.status === "completed" || input.status === "archived") {
    return { level: "healthy", reasons: [] };
  }

  const critical: string[] = [];
  const warning: string[] = [];

  const days = input.deadline ? daysUntil(input.deadline) : null;
  if (days !== null) {
    if (days < 0) critical.push(`${-days} ${-days === 1 ? "day" : "days"} overdue`);
    else if (days <= DUE_SOON_DAYS) warning.push(`due in ${days} ${days === 1 ? "day" : "days"}`);
  }

  if (input.consumptionPct !== null) {
    if (input.consumptionPct >= 100) critical.push(`over budget (${input.consumptionPct.toFixed(0)}%)`);
    else if (input.consumptionPct >= BUDGET_WARN_PCT)
      warning.push(`${input.consumptionPct.toFixed(0)}% of budget used`);
  }

  const lag = scheduleLagPts(input.startDate, input.deadline, input.progressPct);
  if (lag !== null && lag > SCHEDULE_LAG_PTS) warning.push("progress behind schedule");

  if (critical.length > 0) return { level: "critical", reasons: [...critical, ...warning] };
  if (warning.length > 0) return { level: "warning", reasons: warning };
  return { level: "healthy", reasons: [] };
}

/** How many points progress trails the elapsed share of the timeline (positive = behind).
 * Null when there's no timeline or no derived progress to compare. */
function scheduleLagPts(
  startDate: string | null,
  deadline: string | null,
  progressPct: number | null
): number | null {
  if (!startDate || !deadline || progressPct === null) return null;
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${deadline}T00:00:00Z`).getTime();
  const now = Date.now();
  if (!(end > start) || now <= start) return null;
  const elapsedPct = Math.min((now - start) / (end - start), 1) * 100;
  return elapsedPct - progressPct;
}

// Shared badge look for the derived level -- same tint tiers as HEALTH_BADGE_CLASS had, but
// critical gets an explicit red tint (usable with variant="outline" everywhere).
export const DERIVED_HEALTH_BADGE_CLASS: Record<DerivedHealthLevel, string> = {
  healthy: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  critical: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
};

export function healthTitle(h: DerivedHealth): string {
  return h.reasons.length > 0 ? h.reasons.join(" · ") : "on track";
}
