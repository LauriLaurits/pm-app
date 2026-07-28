import type { createClient } from "@/lib/supabase/server";
import type { ProjectBudgetRow, ProjectListRow, PersonWorkloadRow } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const CREDENTIAL_HORIZON_DAYS = 30;

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Every read here goes through RLS'd tables/views only (project_list_rows, project_budget_rows,
// person_workload_rows, projects/project_status_updates/credentials/time_entries/project_parts) --
// never part_costs/rates directly. Financial columns on project_budget_rows are already nulled by
// its own security_invoker gating; this module just carries rows through, it never re-derives money.

// Base project + budget + workload rows -- fetched together since every card/chart/attention
// section on the dashboard derives from one of these three.
export async function fetchDashboardBase(supabase: Supabase) {
  const [projectsRes, budgetRes, workloadRes] = await Promise.all([
    supabase.from("project_list_rows").select("*"),
    supabase.from("project_budget_rows").select("*"),
    supabase
      .from("person_workload_rows")
      .select("id, full_name, current_allocation_pct, weekly_capacity_hours, on_vacation_now"),
  ]);

  return {
    projects: (projectsRes.data ?? []) as ProjectListRow[],
    projectsError: projectsRes.error,
    budgetRows: (budgetRes.data ?? []) as ProjectBudgetRow[],
    budgetError: budgetRes.error,
    workloadRows: (workloadRes.data ?? []) as Pick<
      PersonWorkloadRow,
      "id" | "full_name" | "current_allocation_pct" | "weekly_capacity_hours" | "on_vacation_now"
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
export async function fetchExpiringCredentials(supabase: Supabase) {
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

  return rows.map((r) => ({ ...r, projectName: nameById.get(r.project_id) ?? null }));
}
