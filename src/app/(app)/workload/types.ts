// Presentational formatting helpers for the Workload timeline UI. The row/cell shapes themselves
// (and the pure builder that assembles them) live in src/lib/workload-timeline.ts so they're
// unit-testable without a Supabase round trip -- re-exported here for convenience.

export type { WeekCell, PersonTimelineRow } from "@/lib/workload-timeline";

// Day-first ("27 Jul") everywhere on this page -- matches the employees badges
// (formatShortDate) rather than the older US-style "Jul 27".
const DAY_MONTH: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", timeZone: "UTC" };

export function formatWeekLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", DAY_MONTH);
}

/** Monday-start week -> its Sunday, as ISO. Each grid column spans exactly this range. */
export function weekEndISO(startISO: string): string {
  const d = new Date(`${startISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

export function formatRangeLabel(startISO: string, endISO: string): string {
  const start = new Date(`${startISO}T00:00:00Z`);
  const end = new Date(`${endISO}T00:00:00Z`);
  const startLabel = start.toLocaleDateString("en-GB", { ...DAY_MONTH, year: "numeric" });
  const endLabel = end.toLocaleDateString("en-GB", DAY_MONTH);
  return `${startLabel} – ${endLabel}`;
}
