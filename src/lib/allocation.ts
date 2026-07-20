// A PM thinks in days per week ("Marko is on this 3 days a week"), not in percentages. The DB and
// the Workload math still work in allocation_pct (percent of a standard week), so this is the one
// place that converts between the two. A standard work week is 5 days, so 1 day = 20%.
export const WORK_WEEK_DAYS = 5;

/** Days per week -> allocation_pct for storage. 3 days -> 60. */
export function daysToPct(days: number): number {
  return Math.round((days / WORK_WEEK_DAYS) * 100);
}

/** allocation_pct -> days per week for display/editing, snapped to the nearest half day. 60 -> 3. */
export function pctToDays(pct: number): number {
  return Math.round((pct / 100) * WORK_WEEK_DAYS * 2) / 2;
}

/** "3 days/wk" — the label shown in the People table. */
export function formatDaysPerWeek(pct: number | null): string {
  if (pct == null) return "—";
  const d = pctToDays(pct);
  return `${d} ${d === 1 ? "day" : "days"}/wk`;
}
