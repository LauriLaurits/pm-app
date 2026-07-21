import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
// PeopleFilters is intentionally NOT rendered: client feedback round 1 wants the whole filter
// row (search + department/availability/skill dropdowns) hidden for now. The component file
// stays in the tree so it can come straight back when the client changes their mind.
import { PeopleTable } from "./people-table";
import { PersonFormDialog } from "./person-form-dialog";
import type { PersonListRow, PersonWorkloadRow } from "./types";

export default async function PeoplePage() {
  const supabase = await createClient();

  // UX gating only -- the real security boundary is requirePermission() inside
  // upsertPersonAction/setPersonStatusAction/deletePersonAction, which re-checks
  // has_permission server-side regardless of what's rendered here.
  const current = await getCurrentUser();

  // One parallel round trip for everything independent (perf feedback: these used to run in
  // series, each adding a full DB round trip to TTFB). managed_options feeds the person form's
  // Role title / Team selects (admin-curated in Settings -> Lists).
  const [{ data, error }, { data: canManagePeople }, { data: optionRows }] = await Promise.all([
    supabase.from("person_workload_rows").select("*").order("full_name", { ascending: true }),
    current
      ? supabase.rpc("has_permission", { uid: current.user.id, perm: "manage_people" })
      : Promise.resolve({ data: false }),
    supabase.from("managed_options").select("kind, value").order("sort").order("value"),
  ]);

  const roleTitleOptions = (optionRows ?? [])
    .filter((o) => o.kind === "role_title")
    .map((o) => o.value);
  const teamOptions = (optionRows ?? []).filter((o) => o.kind === "team").map((o) => o.value);

  const workloadRows = (data ?? []) as PersonWorkloadRow[];
  const canManage = !!canManagePeople;

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Employees</h1>
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
        />
      )}
    </div>
  );
}
