// Pure helpers for the main dashboard (Phase 5, Task 3). Like budget.ts/workload.ts, this module
// never touches Supabase -- it only classifies/buckets values the server component already read
// out of RLS-gated tables/views. Date math is done in whole days against UTC midnight so a caller
// can pass a plain `now` for deterministic tests.

const DAY_MS = 24 * 60 * 60 * 1000;

function atUTCMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// Whole days from `from` to `dateISO` (positive = in the future, negative = in the past).
export function daysUntil(dateISO: string, from: Date = new Date()): number {
  const target = atUTCMidnight(new Date(`${dateISO}T00:00:00Z`));
  const today = atUTCMidnight(from);
  return Math.round((target - today) / DAY_MS);
}

// A deadline is "approaching" if it's today or within the next `days` days -- a deadline that
// already passed is overdue, not approaching, so it's excluded here (surfaced separately if ever
// needed; the spec only asks for the upcoming window).
export function isApproachingDeadline(
  deadline: string | null,
  days = 14,
  from: Date = new Date()
): boolean {
  if (!deadline) return false;
  const delta = daysUntil(deadline, from);
  return delta >= 0 && delta <= days;
}

// A project's status is "stale" if its last status update is more than `days` old, OR it has
// never had one at all (null last-update date reads as stale, not fresh).
export function isStaleStatus(
  lastUpdateISO: string | null,
  days = 14,
  from: Date = new Date()
): boolean {
  if (!lastUpdateISO) return true;
  return daysUntil(lastUpdateISO.slice(0, 10), from) < -days;
}

// "YYYY-MM" bucket key for grouping dated rows (budget_items.occurred_on, time_entries.entry_date)
// into months for the monthly-trend charts.
export function monthKey(dateISO: string): string {
  return dateISO.slice(0, 7);
}

export function monthLabel(key: string): string {
  const d = new Date(`${key}-01T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

// The last `count` month keys ending at (and including) the month of `from`, oldest first -- used
// to pre-populate a chart's x-axis with zero-filled months rather than only the months that
// happen to have data.
export function lastNMonthKeys(count: number, from: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

// [start, end) ISO date bounds for the calendar month the finance card's selector points at --
// "this" is the month of `from`, "last" is the one before it. Exclusive end bound (first day of
// the following month) so callers can use a plain `.lt("occurred_on", end)` instead of an
// inclusive last-day computation.
export function financeMonthRange(kind: "this" | "last", from: Date = new Date()): { start: string; end: string } {
  const offset = kind === "this" ? 0 : -1;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    start: iso(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + offset, 1))),
    end: iso(new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + offset + 1, 1))),
  };
}
