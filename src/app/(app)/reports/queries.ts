import type { createClient } from "@/lib/supabase/server";
import type { PersonWorkloadRow, ProjectBudgetRow } from "../dashboard/types";
import type { ReportsWindow } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Every read here goes through RLS'd tables (time_entries, budgets, budget_items) only -- never
// part_costs/rates directly. This module never re-derives money, it only buckets rows the caller
// was already allowed to read.
//
// The old fetchMonthlyActualCosts/fetchMonthlyHours (trailing-N-months, self-contained queries
// each with their own `isoMonthsAgo` cutoff and month bucketing) are gone as of Task 3 -- their
// last caller (page.tsx's pre-v2 charts) now gets the same data for free out of fetchReportsBase's
// single timeEntries/budgetItems reads below, bucketed by compute.ts's buildMonthlyHours/
// buildMonthlyFinance against a proper ReportsWindow (current + previous, for deltas) instead of a
// second round trip. Task 4 also retired the separate fetchDashboardBase read page.tsx used to run
// alongside this one (it only fed the now-deleted computeBudgetSpentChart/computeCapacityChart) --
// budgetRows/people below are the same RLS-gated views, one fewer query.

// ============================================================================================
// Reports v2 data layer (Task 1). One parallel read wave for the whole /reports page: a single
// time_entries read spans [prevStart, end) ONCE (bucketed client-side in compute.ts into
// previous/current windows, per-project splits, and performance hours -- never re-queried per
// chart); budget_items (invoice + actual_cost) over the same [prevStart, end) span, resolved to
// their project via a `budgets` lookup (a two-step idiom -- budget_items has no project_id column
// of its own); project_budget_rows (already RLS-gated -- client_amount/invoiced/paid/remaining/
// consumption_pct need view_budget, internal_cost/margin/margin_pct need view_internal_cost, both
// null otherwise); person_workload_rows (capacity rows, avatar_url included); and projects (id,
// tags) for the icon tiles Task 2's UI resolves per row (mirrors budgets/page.tsx's projectRefs
// read).
// ============================================================================================

export type ReportsBudgetItemRow = {
  amount: number;
  occurred_on: string;
  item_type: "invoice" | "actual_cost";
  project_id: string | null;
};

// budget_items rows (invoice + actual_cost types only, per the brief -- NOT planned_cost, unlike
// fetchMonthlyActualCosts above) within [prevStartISO, endISO), resolved to project_id via a
// `budgets` lookup. RLS scopes both reads to what the caller may see; cost-type rows additionally
// require view_internal_cost (see "view budget items" policy, 20260715000005_budgets.sql) so a
// caller without finance visibility gets zero actual_cost rows back regardless.
async function fetchReportsBudgetItems(supabase: Supabase, window: ReportsWindow): Promise<ReportsBudgetItemRow[]> {
  const { data: budgets } = await supabase.from("budgets").select("id, project_id");
  const budgetIds = (budgets ?? []).map((b) => b.id);
  if (budgetIds.length === 0) return [];
  const projectIdByBudget = new Map((budgets ?? []).map((b) => [b.id, b.project_id]));

  const { data: items } = await supabase
    .from("budget_items")
    .select("amount, occurred_on, item_type, budget_id")
    .in("item_type", ["invoice", "actual_cost"])
    .in("budget_id", budgetIds)
    .gte("occurred_on", window.prevStartISO)
    .lt("occurred_on", window.endISO);

  return (items ?? []).map((item) => ({
    amount: item.amount,
    occurred_on: item.occurred_on,
    item_type: item.item_type as "invoice" | "actual_cost",
    project_id: projectIdByBudget.get(item.budget_id) ?? null,
  }));
}

export type ReportsTimeEntryRow = { hours: number; billable: boolean; entry_date: string; project_id: string };

// The ONE time_entries read the whole page needs -- spans [prevStart, end), never re-queried per
// chart/tile. compute.ts's builders each bucket this same array into whichever slice they need
// (current window, previous window, per-project, per-month).
async function fetchReportsTimeEntries(supabase: Supabase, window: ReportsWindow): Promise<ReportsTimeEntryRow[]> {
  const { data } = await supabase
    .from("time_entries")
    .select("hours, billable, entry_date, project_id")
    .gte("entry_date", window.prevStartISO)
    .lt("entry_date", window.endISO);
  return data ?? [];
}

export type ReportsProjectRef = { id: string; tags: string[] | null };

// One parallel wave: every read below is independent of the others, so they all run as one
// Promise.all round trip (perf discipline per dashboard/queries.ts's fetchDashboardBase and
// budgets/page.tsx). `errors` surface exactly like fetchDashboardBase does -- the caller decides
// how to render a failure, this function never throws.
export async function fetchReportsBase(supabase: Supabase, window: ReportsWindow) {
  const [timeEntries, budgetItems, budgetRes, workloadRes, projectsRes] = await Promise.all([
    fetchReportsTimeEntries(supabase, window),
    fetchReportsBudgetItems(supabase, window),
    supabase.from("project_budget_rows").select("*"),
    supabase
      .from("person_workload_rows")
      .select("id, full_name, current_allocation_pct, weekly_capacity_hours, status, on_vacation_now, avatar_url"),
    supabase.from("projects").select("id, tags"),
  ]);

  return {
    timeEntries,
    budgetItems,
    budgetRows: (budgetRes.data ?? []) as ProjectBudgetRow[],
    budgetError: budgetRes.error,
    people: (workloadRes.data ?? []) as Pick<
      PersonWorkloadRow,
      "id" | "full_name" | "current_allocation_pct" | "weekly_capacity_hours" | "status" | "on_vacation_now" | "avatar_url"
    >[],
    peopleError: workloadRes.error,
    projects: (projectsRes.data ?? []) as ReportsProjectRef[],
    projectsError: projectsRes.error,
  };
}
