// Presentational formatting helpers for the Workload timeline UI. The row/cell shapes themselves
// (and the pure builder that assembles them) live in src/lib/workload-timeline.ts so they're
// unit-testable without a Supabase round trip -- re-exported here for convenience.

export type { WeekCell, PersonTimelineRow } from "@/lib/workload-timeline";

export function formatWeekLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatRangeLabel(startISO: string, endISO: string): string {
  const start = new Date(`${startISO}T00:00:00Z`);
  const end = new Date(`${endISO}T00:00:00Z`);
  const fmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  const startLabel = start.toLocaleDateString("en-US", { ...fmt, year: "numeric" });
  const endLabel = end.toLocaleDateString("en-US", fmt);
  return `${startLabel} – ${endLabel}`;
}
