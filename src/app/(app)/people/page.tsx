import { Briefcase, CircleCheckBig, Gauge, Plane, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { StatCard } from "@/components/stat-card";
import { PeopleTable } from "./people-table";
import { PersonFormDialog } from "./person-form-dialog";
import { utilizationClass } from "./types";
import type { PersonListRow, PersonWorkloadRow } from "./types";

function distinct(values: (string | null)[]) {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort();
}

export default async function PeoplePage() {
  const supabase = await createClient();

  // UX gating only -- the real security boundary is requirePermission() inside
  // upsertPersonAction/setPersonStatusAction/deletePersonAction, which re-checks
  // has_permission server-side regardless of what's rendered here.
  const current = await getCurrentUser();

  const today = new Date().toISOString().slice(0, 10);

  // One parallel round trip for everything independent (perf feedback: these used to run in
  // series, each adding a full DB round trip to TTFB). managed_options feeds the person form's
  // Role title / Team selects (admin-curated in Settings -> Lists). The assignments read powers
  // the Active-projects tooltip ONLY: it's the ordinary RLS-scoped table (a viewer gets rows
  // back only for projects they hold view_team on, or their own), so the tooltip may list fewer
  // names than active_project_count -- fine by design. The count itself stays the view's
  // SECURITY DEFINER aggregate, same as the Workload bar.
  const [{ data, error }, { data: canManagePeople }, { data: optionRows }, { data: assignmentRows }] =
    await Promise.all([
      supabase.from("person_workload_rows").select("*").order("full_name", { ascending: true }),
      current
        ? supabase.rpc("has_permission", { uid: current.user.id, perm: "manage_people" })
        : Promise.resolve({ data: false }),
      supabase.from("managed_options").select("kind, value").order("sort").order("value"),
      supabase
        .from("assignments")
        .select("person_id, projects(name)")
        .lte("start_date", today)
        .or(`end_date.is.null,end_date.gte.${today}`),
    ]);

  const roleTitleOptions = (optionRows ?? [])
    .filter((o) => o.kind === "role_title")
    .map((o) => o.value);
  const teamOptions = (optionRows ?? []).filter((o) => o.kind === "team").map((o) => o.value);

  const workloadRows = (data ?? []) as PersonWorkloadRow[];
  const canManage = !!canManagePeople;

  // Distinct visible project names per person, for the Active-projects hover tooltip.
  const projectNamesByPersonId: Record<string, string[]> = {};
  for (const a of assignmentRows ?? []) {
    const name = a.projects?.name;
    if (!name) continue;
    const list = (projectNamesByPersonId[a.person_id] ??= []);
    if (!list.includes(name)) list.push(name);
  }
  for (const list of Object.values(projectNamesByPersonId)) list.sort();

  // person_workload_rows has no `email` column -- fetch it separately from `people` for
  // managers only (it's only needed as an edit-form default, not for display).
  const emailByPersonId = new Map<string, string | null>();
  const ids = workloadRows.map((r) => r.id).filter((id): id is string => !!id);
  if (canManage && ids.length > 0) {
    const { data: peopleRows } = await supabase.from("people").select("id, email").in("id", ids);
    for (const p of peopleRows ?? []) emailByPersonId.set(p.id, p.email);
  }
  const rows: PersonListRow[] = workloadRows
    .filter((r): r is PersonWorkloadRow & { id: string } => !!r.id)
    .map((r) => ({ ...r, email: emailByPersonId.get(r.id) ?? null }));

  // KPI rollups straight off the workload view: Available = ACTIVE, under-90% utilization and
  // not currently on vacation (a deactivated person can't take work, so they never count);
  // Busy = full/overallocated; Away = on vacation today (derived, same as the table's Away
  // status); Contractors = external engagement types.
  const util = (r: PersonListRow) => utilizationClass(r.current_allocation_pct ?? 0);
  const availableCount = rows.filter(
    (r) =>
      r.status === "active" &&
      !r.on_vacation_now &&
      (util(r) === "available" || util(r) === "partial")
  ).length;
  const busyCount = rows.filter((r) => util(r) === "full" || util(r) === "overallocated").length;
  const awayCount = rows.filter((r) => r.on_vacation_now).length;
  const contractorCount = rows.filter(
    (r) => r.employment_type === "contractor" || r.employment_type === "freelance"
  ).length;

  // Role filter options come from the values actually present in the visible list (the
  // managed_options list above is the FORM's curated vocabulary, not a filter facet).
  const roleFilterOptions = distinct(rows.map((r) => r.role_title));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Employees</h1>
          {rows.length > 0 && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {rows.length} employee{rows.length === 1 ? "" : "s"}
              <span className="mx-1.5 text-border">·</span>
              {availableCount} available
              <span className="mx-1.5 text-border">·</span>
              {busyCount} busy
              <span className="mx-1.5 text-border">·</span>
              {awayCount} away
            </p>
          )}
        </div>
        {canManage && (
          <PersonFormDialog roleTitleOptions={roleTitleOptions} teamOptions={teamOptions} />
        )}
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatCard icon={Users} label="Total employees" value={String(rows.length)} iconClass="bg-blue-500/10 text-blue-600 dark:text-blue-400" />
          <StatCard icon={CircleCheckBig} label="Available" value={String(availableCount)} iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" />
          <StatCard icon={Gauge} label="Busy" value={String(busyCount)} iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-400" />
          <StatCard icon={Plane} label="Away" value={String(awayCount)} iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-400" />
          <StatCard icon={Briefcase} label="Contractors" value={String(contractorCount)} iconClass="bg-teal-500/10 text-teal-600 dark:text-teal-400" />
        </div>
      )}

      {error ? (
        <p className="text-destructive">Failed to load employees. Try again.</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          No employees yet.
        </div>
      ) : (
        <PeopleTable
          rows={rows}
          canManage={canManage}
          roleTitleOptions={roleTitleOptions}
          teamOptions={teamOptions}
          roleFilterOptions={roleFilterOptions}
          projectNamesByPersonId={projectNamesByPersonId}
        />
      )}
    </div>
  );
}
