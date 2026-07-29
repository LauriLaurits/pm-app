import type { createClient } from "@/lib/supabase/server";
import type { AuditLogRow } from "../activity/types";
import type { ExpiringCredential, MilestoneLite, ProjectBudgetRow, ProjectListRow, PersonWorkloadRow } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const CREDENTIAL_HORIZON_DAYS = 30;
const MILESTONE_HORIZON_DAYS = 30;

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Every read here goes through RLS'd tables/views only (project_list_rows, project_budget_rows,
// person_workload_rows, projects/project_status_updates/credentials/project_milestones/
// budget_items/audit_logs) -- never part_costs/rates directly. Financial columns on
// project_budget_rows are already nulled by its own security_invoker gating; this module just
// carries rows through, it never re-derives money.

// Base project + budget + workload rows -- fetched together since every card/chart/attention
// section on the dashboard derives from one of these three. Workload now also carries `status`
// (computeSummary's availableCount needs it, mirroring people/page.tsx's Available rule) and
// `avatar_url` (the Team card, Task 4) -- both already exposed by person_workload_rows.
export async function fetchDashboardBase(supabase: Supabase) {
  const [projectsRes, budgetRes, workloadRes] = await Promise.all([
    supabase.from("project_list_rows").select("*"),
    supabase.from("project_budget_rows").select("*"),
    supabase
      .from("person_workload_rows")
      .select("id, full_name, current_allocation_pct, weekly_capacity_hours, on_vacation_now, status, avatar_url"),
  ]);

  return {
    projects: (projectsRes.data ?? []) as ProjectListRow[],
    projectsError: projectsRes.error,
    budgetRows: (budgetRes.data ?? []) as ProjectBudgetRow[],
    budgetError: budgetRes.error,
    workloadRows: (workloadRes.data ?? []) as Pick<
      PersonWorkloadRow,
      "id" | "full_name" | "current_allocation_pct" | "weekly_capacity_hours" | "on_vacation_now" | "status" | "avatar_url"
    >[],
    workloadError: workloadRes.error,
  };
}

// Latest status update timestamp per project (RLS: "view status updates", same view_project gate
// as the project itself) -- reduced client-side to one row per project since PostgREST has no
// simple GROUP BY max() through the JS client.
export async function fetchLatestStatusUpdateByProject(supabase: Supabase) {
  const { data } = await supabase
    .from("project_status_updates")
    .select("project_id, created_at")
    .order("created_at", { ascending: false });

  const latest = new Map<string, string>();
  for (const row of data ?? []) {
    if (!latest.has(row.project_id)) latest.set(row.project_id, row.created_at);
  }
  return latest;
}

// Credentials expiring within the horizon (or already expired) -- RLS ("view credential
// metadata") already scopes this to what the caller may see. Project names are fetched
// separately (not via a `projects(name)` embed) and merged in JS: `credentials_project_id_fkey`
// shows up multiple times in the generated types (once per view built on `projects`), which makes
// PostgREST's embed resolution ambiguous -- the Workload timeline (src/app/(app)/workload/page.tsx)
// sidesteps the exact same ambiguity the same way, fetching `projects` separately and joining via
// a Map.
export async function fetchExpiringCredentials(supabase: Supabase): Promise<ExpiringCredential[]> {
  const { data } = await supabase
    .from("credentials")
    .select("id, name, expires_at, project_id")
    .not("expires_at", "is", null)
    .lte("expires_at", isoDaysFromNow(CREDENTIAL_HORIZON_DAYS))
    .order("expires_at", { ascending: true })
    .limit(8);
  const rows = data ?? [];

  const projectIds = [...new Set(rows.map((r) => r.project_id))];
  const { data: projectRows } = projectIds.length
    ? await supabase.from("projects").select("id, name").in("id", projectIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((projectRows ?? []).map((p) => [p.id, p.name]));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    expires_at: r.expires_at as string, // guaranteed by the `.not("expires_at", "is", null)` filter above
    project_id: r.project_id,
    projectName: nameById.get(r.project_id) ?? null,
  }));
}

// Undone milestones due within the horizon (overdue ones included -- no lower bound, same
// "overdue + next N days" window buildDeadlineTimeline windows against). RLS ("view project
// milestones", same view_project gate as the project) scopes this to what the caller may see.
// Project names joined the same two-step way as fetchExpiringCredentials, for the same reason.
export async function fetchMilestonesUpcoming(supabase: Supabase, todayISO: string): Promise<MilestoneLite[]> {
  const { data } = await supabase
    .from("project_milestones")
    .select("id, project_id, name, due_on, done")
    .eq("done", false)
    .lte("due_on", addDaysISO(todayISO, MILESTONE_HORIZON_DAYS))
    .order("due_on", { ascending: true });
  const rows = data ?? [];

  const projectIds = [...new Set(rows.map((r) => r.project_id))];
  const { data: projectRows } = projectIds.length
    ? await supabase.from("projects").select("id, name").in("id", projectIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((projectRows ?? []).map((p) => [p.id, p.name]));

  return rows.map((r) => ({ ...r, projectName: nameById.get(r.project_id) ?? null }));
}

// Sum of budget_items where item_type = 'invoice', occurred_on within [startISO, endISO), scoped
// to ACTIVE projects only -- client-facing money, gated by view_budget alone (see "view budget
// items" policy, 20260715000005_budgets.sql: cost-type rows need view_internal_cost too,
// invoice/payment/change don't), so this is safe to call whenever project_budget_rows shows any
// client_amount. The active-project scope matters here: computeFinanceOverview's
// totalClientAmount/remaining denominator (compute.ts) is active-projects-only, so this numerator
// has to match that scope too, or monthInvoicedPct could read over 100% on a portfolio with a
// completed/archived project invoiced in the selected month. Two-step fetch -- active project ids,
// then their budget ids, then the items themselves -- same idiom as reports/queries.ts's
// fetchMonthlyActualCosts (which reads every budget id unscoped; this adds the status filter via a
// project read first). RLS already scopes every read here to what the caller may see -- this join
// is a STATUS filter, not a security one. `endISO` is exclusive (the first day of the month after
// the one being scoped) -- page.tsx derives both bounds from financeMonthRange so the finance
// card's "This month"/"Last month" selector can re-scope this to either calendar month.
export async function fetchMonthInvoiceTotal(
  supabase: Supabase,
  startISO: string,
  endISO: string
): Promise<number | null> {
  const { data: activeProjects, error: projectsError } = await supabase
    .from("projects")
    .select("id")
    .eq("status", "active");
  if (projectsError) return null;
  const activeProjectIds = activeProjects.map((p) => p.id);
  if (activeProjectIds.length === 0) return 0;

  const { data: budgets, error: budgetsError } = await supabase
    .from("budgets")
    .select("id")
    .in("project_id", activeProjectIds);
  if (budgetsError) return null;
  const budgetIds = budgets.map((b) => b.id);
  if (budgetIds.length === 0) return 0;

  const { data, error } = await supabase
    .from("budget_items")
    .select("amount")
    .eq("item_type", "invoice")
    .in("budget_id", budgetIds)
    .gte("occurred_on", startISO)
    .lt("occurred_on", endISO);
  if (error || !data) return null;
  return data.reduce((sum, r) => sum + Number(r.amount), 0);
}

// Last N audit_logs rows -- only ever called after the page has confirmed the viewer holds
// view_audit (the RPC check activity/page.tsx already does); RLS on audit_logs enforces the same
// gate independently, so this is belt-and-suspenders, not the only gate.
export async function fetchRecentAudit(supabase: Supabase, limit = 6): Promise<AuditLogRow[]> {
  const { data } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export type RecentStatusUpdate = {
  projectId: string;
  projectName: string | null;
  field: "completed" | "in_progress" | "blockers" | "decisions_needed" | "handover_info" | "next_milestone";
  text: string;
  createdAt: string;
};

const STATUS_FIELD_PRIORITY: RecentStatusUpdate["field"][] = [
  "completed",
  "in_progress",
  "blockers",
  "decisions_needed",
  "handover_info",
  "next_milestone",
];

// Last N status-update rows, reduced to their newest non-empty field -- the Activity card's
// fallback for viewers without view_audit (Task 5). Same RLS gate as
// fetchLatestStatusUpdateByProject ("view status updates"); project names joined the same
// two-step way as fetchExpiringCredentials/fetchMilestonesUpcoming.
export async function fetchRecentStatusUpdates(supabase: Supabase, limit = 6): Promise<RecentStatusUpdate[]> {
  const { data } = await supabase
    .from("project_status_updates")
    .select("project_id, completed, in_progress, blockers, decisions_needed, handover_info, next_milestone, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = data ?? [];

  const projectIds = [...new Set(rows.map((r) => r.project_id))];
  const { data: projectRows } = projectIds.length
    ? await supabase.from("projects").select("id, name").in("id", projectIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((projectRows ?? []).map((p) => [p.id, p.name]));

  const result: RecentStatusUpdate[] = [];
  for (const row of rows) {
    const field = STATUS_FIELD_PRIORITY.find((f) => row[f]);
    if (!field) continue;
    result.push({
      projectId: row.project_id,
      projectName: nameById.get(row.project_id) ?? null,
      field,
      text: row[field] as string,
      createdAt: row.created_at,
    });
  }
  return result;
}
