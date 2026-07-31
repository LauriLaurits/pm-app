import { monthKey, monthLabel } from "@/lib/dashboard";
import { utilizationClass } from "@/lib/workload";
import { budgetStatus } from "../budgets/types";
import type { BudgetRow, WorkloadPerson } from "../dashboard/types";
import type {
  ReportsWindow,
  TrendDelta,
  ReportsKpis,
  MonthlyHoursPoint,
  ProjectHoursSlice,
  UtilizationRow,
  CapacityRow,
  MonthlyFinancePoint,
  PerformanceRow,
} from "./types";

// ============================================================================================
// Reports v2 data layer (Task 1, .superpowers/sdd/2026-07-29-reports-v2). Pure builders only --
// every function below is handed rows the caller already read out of RLS-gated tables/views
// (same discipline as dashboard/compute.ts and lib/budget.ts): no Supabase access, no re-deriving
// money the views already gate (margin_pct is read verbatim off project_budget_rows, never
// recomputed), no coercing a gated null into a fake 0/NaN.
// ============================================================================================

// ---- window ----

// [start, end) ISO bounds for a `months`-long window ending at (and including) the calendar month
// containing `todayISO`, plus the same-length previous window immediately before it (contiguous --
// the previous window's exclusive end is startISO, no gap/overlap). `endISO` is exclusive (first
// day of the month AFTER the window) so callers can `.gte(prevStartISO).lt(endISO)` in one read,
// same idiom as lib/dashboard's financeMonthRange. `label` formats the CURRENT window only, e.g.
// "1 Feb – 31 Jul 2026" -- the start date drops its year when it matches the end date's year.
export function reportsWindow(months: number, todayISO: string): ReportsWindow {
  const today = new Date(`${todayISO}T00:00:00Z`);
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();

  const startDate = new Date(Date.UTC(y, m - (months - 1), 1));
  const endDate = new Date(Date.UTC(y, m + 1, 1)); // exclusive
  const prevStartDate = new Date(Date.UTC(y, m - (months - 1) - months, 1));
  const lastDayDate = new Date(Date.UTC(y, m + 1, 0)); // last calendar day of the current window

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const dayMonth = (d: Date) => `${d.getUTCDate()} ${d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}`;
  const full = (d: Date) => `${dayMonth(d)} ${d.getUTCFullYear()}`;
  const label =
    startDate.getUTCFullYear() === lastDayDate.getUTCFullYear()
      ? `${dayMonth(startDate)} – ${full(lastDayDate)}`
      : `${full(startDate)} – ${full(lastDayDate)}`;

  return {
    months: months as 3 | 6 | 12,
    startISO: iso(startDate),
    endISO: iso(endDate),
    prevStartISO: iso(prevStartDate),
    label,
  };
}

function inCurrentWindow(dateISO: string, window: ReportsWindow): boolean {
  return dateISO >= window.startISO && dateISO < window.endISO;
}

function inPreviousWindow(dateISO: string, window: ReportsWindow): boolean {
  return dateISO >= window.prevStartISO && dateISO < window.startISO;
}

// "YYYY-MM" keys for every calendar month in the current window, oldest first -- used to
// zero-fill monthly series so a month with no rows still renders instead of being skipped.
function windowMonthKeys(window: ReportsWindow): string[] {
  const keys: string[] = [];
  const start = new Date(`${window.startISO}T00:00:00Z`);
  const end = new Date(`${window.endISO}T00:00:00Z`);
  let cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cur < end) {
    keys.push(monthKey(cur.toISOString().slice(0, 10)));
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  return keys;
}

// ---- deltas ----

// Period-over-period change as a percent + direction. `null` (not 0%/Infinity%) when `previous`
// is zero or absent -- there is no meaningful percentage change off a zero/nonexistent base.
export function trendDelta(current: number, previous: number): TrendDelta {
  if (!previous) return null;
  const pct = ((current - previous) / previous) * 100;
  const direction = current > previous ? "up" : current < previous ? "down" : "flat";
  return { pct, direction };
}

// ---- monthly hours ----

// Buckets time_entries (full [prevStart, end) read) into the CURRENT window's months only,
// billable vs non-billable, zero-filled for months with no entries. `month` is a display label
// (lib/dashboard's monthLabel), matching the convention the old /reports page already applied
// client-side before handing points to the chart.
export function buildMonthlyHours(
  rows: { hours: number; billable: boolean; entry_date: string }[],
  window: ReportsWindow
): MonthlyHoursPoint[] {
  const byMonth = new Map<string, { billable: number; nonBillable: number }>();
  for (const row of rows) {
    if (!inCurrentWindow(row.entry_date, window)) continue;
    const key = monthKey(row.entry_date);
    const bucket = byMonth.get(key) ?? { billable: 0, nonBillable: 0 };
    if (row.billable) bucket.billable += Number(row.hours);
    else bucket.nonBillable += Number(row.hours);
    byMonth.set(key, bucket);
  }
  return windowMonthKeys(window).map((key) => {
    const b = byMonth.get(key) ?? { billable: 0, nonBillable: 0 };
    return {
      month: monthLabel(key),
      billable: Math.round(b.billable * 10) / 10,
      nonBillable: Math.round(b.nonBillable * 10) / 10,
    };
  });
}

// Running total of billable/nonBillable across an already-ordered MonthlyHoursPoint[] series --
// e.g. to render a cumulative-hours-logged trend instead of a per-month one. Month labels pass
// through unchanged.
export function cumulative(points: MonthlyHoursPoint[]): MonthlyHoursPoint[] {
  let billable = 0;
  let nonBillable = 0;
  return points.map((p) => {
    billable += p.billable;
    nonBillable += p.nonBillable;
    return { month: p.month, billable, nonBillable };
  });
}

// ---- top projects by hours ----

const TOP_PROJECTS_N = 5;

// Top 5 projects by hours logged in the CURRENT window, plus one aggregated "Other projects" row
// (id: null) for the rest -- omitted entirely when there are 5 or fewer projects with hours.
// `pct` is each slice's share of the window's total hours (guarded against divide-by-zero: an
// empty window returns an empty array, never NaN slices).
export function buildProjectHoursSlices(
  rows: { project_id: string; hours: number; entry_date: string }[],
  window: ReportsWindow,
  nameById: Record<string, string>
): ProjectHoursSlice[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!inCurrentWindow(row.entry_date, window)) continue;
    totals.set(row.project_id, (totals.get(row.project_id) ?? 0) + Number(row.hours));
  }
  const grandTotal = [...totals.values()].reduce((s, h) => s + h, 0);
  if (grandTotal <= 0) return [];

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, TOP_PROJECTS_N);
  const rest = sorted.slice(TOP_PROJECTS_N);
  const restTotal = rest.reduce((s, [, h]) => s + h, 0);
  const pct = (h: number) => (h / grandTotal) * 100;

  const slices: ProjectHoursSlice[] = top.map(([id, hours]) => ({
    id,
    name: nameById[id] ?? "Unknown project",
    hours,
    pct: pct(hours),
  }));
  if (restTotal > 0) slices.push({ id: null, name: "Other projects", hours: restTotal, pct: pct(restTotal) });
  return slices;
}

// ---- utilization ----

// Straight column mapping off project_budget_rows -- current-state (not windowed). No
// re-derivation: consumptionPct/remaining/invoiced pass through exactly as the (RLS-gated) view
// returned them.
export function buildUtilizationRows(budgetRows: BudgetRow[]): UtilizationRow[] {
  return budgetRows.map((r) => ({
    id: r.id,
    name: r.name,
    invoiced: r.invoiced,
    budget: r.client_amount,
    consumptionPct: r.consumption_pct,
    remaining: r.remaining,
  }));
}

// ---- capacity ----

// person_workload_rows -> CapacityRow, current-state (not windowed). allocatedHours derives from
// pct * capacity (same formula the old, now-deleted computeCapacityChart used); avatarUrl/pct feed
// the v2 capacity card's PersonAvatar + meter row (Task 4).
export function buildCapacityRows(people: WorkloadPerson[]): CapacityRow[] {
  return people.map((p) => {
    const capacityHours = Number(p.weekly_capacity_hours ?? 0);
    const pct = p.current_allocation_pct ?? 0;
    const allocatedHours = Math.round((pct / 100) * capacityHours * 10) / 10;
    return { id: p.id, name: p.full_name, avatarUrl: p.avatar_url, pct, allocatedHours, capacityHours };
  });
}

// ---- monthly finance ----

// Sums budget_items (item_type invoice|actual_cost, full [prevStart, end) read) into the CURRENT
// window's months, zero-filled. `invoiced` is always a number (never gated -- the caller only
// renders this series/card at all when it has budget visibility, the same never-render-zeroed
// discipline the old computeBudgetSpentChart followed). `cost` is null for EVERY point without
// finance visibility -- never partially populated, never 0-coerced.
export function buildMonthlyFinance(
  items: { amount: number; occurred_on: string; item_type: "invoice" | "actual_cost" }[],
  window: ReportsWindow,
  hasFinanceVisibility: boolean
): MonthlyFinancePoint[] {
  const invoicedByMonth = new Map<string, number>();
  const costByMonth = new Map<string, number>();
  for (const item of items) {
    if (!inCurrentWindow(item.occurred_on, window)) continue;
    const key = monthKey(item.occurred_on);
    if (item.item_type === "invoice") {
      invoicedByMonth.set(key, (invoicedByMonth.get(key) ?? 0) + Number(item.amount));
    } else {
      costByMonth.set(key, (costByMonth.get(key) ?? 0) + Number(item.amount));
    }
  }
  return windowMonthKeys(window).map((key) => ({
    month: monthLabel(key),
    invoiced: invoicedByMonth.get(key) ?? 0,
    cost: hasFinanceVisibility ? costByMonth.get(key) ?? 0 : null,
  }));
}

// ---- performance rollup ----

// hours logged per project in the CURRENT window, split billable/total -- feeds buildPerformanceRows
// and is independent of budget visibility (time_entries has its own, separate RLS gate).
export function hoursByProjectForWindow(
  rows: { project_id: string; hours: number; billable: boolean; entry_date: string }[],
  window: ReportsWindow
): Record<string, { total: number; billable: number }> {
  const byProject: Record<string, { total: number; billable: number }> = {};
  for (const row of rows) {
    if (!inCurrentWindow(row.entry_date, window)) continue;
    const bucket = byProject[row.project_id] ?? { total: 0, billable: 0 };
    bucket.total += Number(row.hours);
    if (row.billable) bucket.billable += Number(row.hours);
    byProject[row.project_id] = bucket;
  }
  return byProject;
}

// Joins project_budget_rows with each project's CURRENT-window hours into one performance row per
// project. Every money figure is read straight off the budget row (client_amount/invoiced/
// internal_cost/remaining/margin_pct) -- margin_pct in particular is NEVER re-derived, only
// consumed verbatim, per the brief. invoicedPct/costPct guard both a null numerator AND a
// null/zero denominator so a gated-null row (client_amount null) reports null, not 0. `status`
// reuses budgetStatus (budgets/types.ts) verbatim -- never forked.
export function buildPerformanceRows(
  budgetRows: BudgetRow[],
  hoursByProject: Record<string, { total: number; billable: number }>
): PerformanceRow[] {
  const pctOfBudget = (n: number | null, budget: number | null) =>
    n === null || budget === null || budget === 0 ? null : (n / budget) * 100;

  return budgetRows.map((r) => {
    const hours = hoursByProject[r.id] ?? { total: 0, billable: 0 };
    const hoursLogged = hours.total;
    return {
      id: r.id,
      name: r.name,
      clientName: r.client_name,
      budget: r.client_amount,
      invoiced: r.invoiced,
      invoicedPct: pctOfBudget(r.invoiced, r.client_amount),
      cost: r.internal_cost,
      costPct: pctOfBudget(r.internal_cost, r.client_amount),
      remaining: r.remaining,
      marginPct: r.margin_pct,
      hoursLogged,
      billablePct: hoursLogged > 0 ? (hours.billable / hoursLogged) * 100 : null,
      status: budgetStatus(r),
    };
  });
}

// ---- KPIs ----

// availableCount rule verbatim from dashboard/compute.ts's computeSummary (itself mirroring
// people/page.tsx's Available rule): active, not on vacation right now, and under "full"
// utilization.
function countAvailable(people: WorkloadPerson[]): number {
  return people.filter((p) => {
    if (p.status !== "active" || p.on_vacation_now) return false;
    const cls = utilizationClass(p.current_allocation_pct ?? 0);
    return cls === "available" || cls === "partial";
  }).length;
}

export function buildReportsKpis(input: {
  window: ReportsWindow;
  timeEntries: { hours: number; entry_date: string }[];
  budgetItems: { amount: number; occurred_on: string; item_type: "invoice" | "actual_cost" }[];
  budgetRows: BudgetRow[];
  people: WorkloadPerson[];
  hasBudgetVisibility: boolean;
  hasFinanceVisibility: boolean;
}): ReportsKpis {
  const { window, timeEntries, budgetItems, budgetRows, people, hasBudgetVisibility, hasFinanceVisibility } = input;

  const currentHours = timeEntries.filter((e) => inCurrentWindow(e.entry_date, window));
  const previousHours = timeEntries.filter((e) => inPreviousWindow(e.entry_date, window));
  const totalHours = currentHours.reduce((s, e) => s + Number(e.hours), 0);
  const prevHours = previousHours.reduce((s, e) => s + Number(e.hours), 0);

  const sumItems = (type: "invoice" | "actual_cost", inWindow: (dateISO: string) => boolean) =>
    budgetItems.filter((i) => i.item_type === type && inWindow(i.occurred_on)).reduce((s, i) => s + Number(i.amount), 0);

  const invoicedCurrent = sumItems("invoice", (d) => inCurrentWindow(d, window));
  const invoicedPrev = sumItems("invoice", (d) => inPreviousWindow(d, window));
  const costCurrent = sumItems("actual_cost", (d) => inCurrentWindow(d, window));
  const costPrev = sumItems("actual_cost", (d) => inPreviousWindow(d, window));

  const budgetRemaining = hasBudgetVisibility
    ? budgetRows.filter((r) => r.client_amount !== null).reduce((s, r) => s + (r.remaining ?? 0), 0)
    : null;

  const avgUtilization = people.length
    ? people.reduce((s, p) => s + (p.current_allocation_pct ?? 0), 0) / people.length
    : 0;
  const availableInfo = `${countAvailable(people)} of ${people.length} available`;

  return {
    totalHours,
    hoursDelta: trendDelta(totalHours, prevHours),
    totalInvoiced: hasBudgetVisibility ? invoicedCurrent : null,
    invoicedDelta: hasBudgetVisibility ? trendDelta(invoicedCurrent, invoicedPrev) : null,
    totalCost: hasFinanceVisibility ? costCurrent : null,
    costDelta: hasFinanceVisibility ? trendDelta(costCurrent, costPrev) : null,
    budgetRemaining,
    avgUtilization,
    availableInfo,
  };
}
