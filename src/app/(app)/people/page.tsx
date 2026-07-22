import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
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

  // Summary-strip rollups only -- no KPI cards here, same call as the clients list: at this
  // scale every candidate metric is already visible in the table itself (workload bars, Away
  // badges, type chips), so cards were decoration. Available = ACTIVE, under-90% utilization
  // and not currently on vacation; Busy = full/overallocated; Away = on vacation today.
  const util = (r: PersonListRow) => utilizationClass(r.current_allocation_pct ?? 0);
  const availableCount = rows.filter(
    (r) =>
      r.status === "active" &&
      !r.on_vacation_now &&
      (util(r) === "available" || util(r) === "partial")
  ).length;
  const busyCount = rows.filter((r) => util(r) === "full" || util(r) === "overallocated").length;
  const awayCount = rows.filter((r) => r.on_vacation_now).length;

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
