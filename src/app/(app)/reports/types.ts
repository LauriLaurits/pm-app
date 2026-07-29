import type { BudgetStatus } from "../budgets/types";

// Reports v2 data-layer types (Task 1 of the reports-v2 rebuild). Every shape here is EXACTLY
// what Tasks 2-5 are briefed from (.superpowers/sdd/2026-07-29-reports-v2/task-1-brief.md) --
// deviating from these signatures breaks the wave. See compute.ts for the builders that produce
// them and queries.ts for the Supabase reads that feed the builders.

// A reporting window: `months` calendar months ending at (and including) the month containing
// `todayISO`, plus a same-length previous window immediately before it for delta comparisons.
// startISO/endISO are the CURRENT window's [start, end) bounds (endISO exclusive -- first day of
// the month after the window); prevStartISO is the previous window's inclusive start (the
// previous window's exclusive end is implicitly startISO -- windows are contiguous, no gap).
// `label` is a human display string for the current window only, e.g. "1 Feb – 31 Jul 2026" (year
// omitted on the start date when both ends fall in the same year).
export type ReportsWindow = {
  months: 3 | 6 | 12;
  startISO: string;
  endISO: string;
  prevStartISO: string;
  label: string;
};

// A period-over-period change. `null` means "no prior data" (previous window's value was zero or
// absent) -- callers must render that as an omitted/dash trend, never a fake 0% or ±Infinity%.
export type TrendDelta = { pct: number; direction: "up" | "down" | "flat" } | null;

export type ReportsKpis = {
  totalHours: number;
  hoursDelta: TrendDelta;
  totalInvoiced: number | null; // null without budget visibility (no row has a non-null client_amount)
  invoicedDelta: TrendDelta;
  totalCost: number | null; // null without finance visibility (no row has a non-null internal_cost)
  costDelta: TrendDelta;
  budgetRemaining: number | null; // current-state (as of now), no delta -- null without budget visibility
  avgUtilization: number; // current-state, no delta
  availableInfo: string; // current-state, no delta -- e.g. "4 of 9 available"
};

export type MonthlyHoursPoint = { month: string; billable: number; nonBillable: number };

export type ProjectHoursSlice = { id: string | null; name: string; hours: number; pct: number }; // top 5 + "Other projects" (id: null)

export type UtilizationRow = {
  id: string;
  name: string;
  invoiced: number | null;
  budget: number | null;
  consumptionPct: number | null;
  remaining: number | null;
};

export type CapacityRow = {
  id: string;
  name: string;
  avatarUrl: string | null;
  pct: number;
  allocatedHours: number;
  capacityHours: number;
};

export type MonthlyFinancePoint = { month: string; invoiced: number; cost: number | null };

export type PerformanceRow = {
  id: string;
  name: string;
  clientName: string | null;
  budget: number | null;
  invoiced: number | null;
  invoicedPct: number | null;
  cost: number | null;
  costPct: number | null;
  remaining: number | null;
  marginPct: number | null; // read verbatim off project_budget_rows.margin_pct -- NEVER re-derived here
  hoursLogged: number;
  billablePct: number | null; // null (not 0/NaN) when hoursLogged is 0
  status: BudgetStatus | "no_budget";
};
