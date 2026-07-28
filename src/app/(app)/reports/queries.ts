import type { createClient } from "@/lib/supabase/server";
import { lastNMonthKeys, monthKey } from "@/lib/dashboard";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const HISTORY_MONTHS = 6;

// Every read here goes through RLS'd tables (time_entries, budgets, budget_items) only -- never
// part_costs/rates directly. This module never re-derives money, it only buckets rows the caller
// was already allowed to read.

function isoMonthsAgo(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months, 1);
  return d.toISOString().slice(0, 10);
}

// budget_items cost-type rows ('planned_cost' + 'actual_cost') over the trailing HISTORY_MONTHS
// window, only ever called when the page has already confirmed the viewer has finance visibility
// (project_budget_rows returned at least one non-null internal_cost) -- RLS on budget_items
// itself additionally requires view_internal_cost for BOTH of these item types (see "view budget
// items" policy, 20260715000005_budgets.sql), so a caller without it would get zero rows back
// anyway; this is a belt-and-suspenders skip, not the only gate. Both item types are summed
// together (not just 'actual_cost') because this dataset only ever logs one dated internal-cost
// entry per project ('planned_cost', at project kickoff) -- 'actual_cost' rows never appear in
// this schema's seed data, so a chart that only counted 'actual_cost' would always be empty even
// for finance. Both types are equally internal/finance-gated money, so summing them is a faithful
// "internal cost logged over time" trend, not a leak of anything client-facing.
export async function fetchMonthlyActualCosts(supabase: Supabase, months: number = HISTORY_MONTHS) {
  const { data: budgets } = await supabase.from("budgets").select("id");
  const budgetIds = (budgets ?? []).map((b) => b.id);
  if (budgetIds.length === 0) return lastNMonthKeys(months).map((month) => ({ month, cost: 0 }));

  const { data: items } = await supabase
    .from("budget_items")
    .select("amount, occurred_on, budget_id")
    .in("item_type", ["planned_cost", "actual_cost"])
    .in("budget_id", budgetIds)
    .gte("occurred_on", isoMonthsAgo(months));

  const byMonth = new Map<string, number>();
  for (const row of items ?? []) {
    const key = monthKey(row.occurred_on);
    byMonth.set(key, (byMonth.get(key) ?? 0) + Number(row.amount));
  }
  return lastNMonthKeys(months).map((month) => ({ month, cost: byMonth.get(month) ?? 0 }));
}

// Hours logged per month, split billable / non-billable, over the selected window. RLS scopes
// time_entries to what the caller may see (own rows + projects they hold view_time on). Not
// finance-sensitive, so it renders for everyone.
export async function fetchMonthlyHours(supabase: Supabase, months: number = HISTORY_MONTHS) {
  const { data } = await supabase
    .from("time_entries")
    .select("hours, billable, entry_date")
    .gte("entry_date", isoMonthsAgo(months));

  const byMonth = new Map<string, { billable: number; nonBillable: number }>();
  for (const row of data ?? []) {
    const key = monthKey(row.entry_date);
    const bucket = byMonth.get(key) ?? { billable: 0, nonBillable: 0 };
    if (row.billable) bucket.billable += Number(row.hours);
    else bucket.nonBillable += Number(row.hours);
    byMonth.set(key, bucket);
  }
  return lastNMonthKeys(months).map((month) => {
    const b = byMonth.get(month) ?? { billable: 0, nonBillable: 0 };
    return { month, billable: Math.round(b.billable * 10) / 10, nonBillable: Math.round(b.nonBillable * 10) / 10 };
  });
}
