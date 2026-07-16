import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { PeopleFilters } from "./people-filters";
import { PeopleTable } from "./people-table";
import { PersonFormDialog } from "./person-form-dialog";
import { utilizationClass } from "./types";
import type { PersonListRow, PersonWorkloadRow } from "./types";

type PeopleSearchParams = {
  q?: string;
  department?: string;
  availability?: string;
  skill?: string;
};

function distinct(values: (string | null)[]) {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort();
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<PeopleSearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  // Unfiltered (RLS-only) pass -- just used to build the department/skill filter dropdown
  // options from whatever this caller can actually see.
  const { data: optionRows } = await supabase
    .from("person_workload_rows")
    .select("department, skills");
  const departmentOptions = distinct((optionRows ?? []).map((r) => r.department));
  const skillOptions = distinct((optionRows ?? []).flatMap((r) => r.skills ?? []));

  let query = supabase.from("person_workload_rows").select("*");
  if (params.department) query = query.eq("department", params.department);
  if (params.skill) query = query.contains("skills", [params.skill]);
  if (params.q) {
    // Strip PostgREST filter metacharacters so a search term can't inject predicates.
    const term = params.q.replace(/[,()*\\]/g, " ").trim();
    if (term) query = query.or(`full_name.ilike.%${term}%,role_title.ilike.%${term}%`);
  }

  const { data, error } = await query.order("full_name", { ascending: true });

  const workloadRows = ((data ?? []) as PersonWorkloadRow[]).filter(
    (row) =>
      !params.availability ||
      utilizationClass(row.current_allocation_pct ?? 0) === params.availability
  );

  // UX gating only -- the real security boundary is requirePermission() inside
  // upsertPersonAction/setPersonStatusAction/deletePersonAction, which re-checks
  // has_permission server-side regardless of what's rendered here.
  const current = await getCurrentUser();
  const { data: canManagePeople } = current
    ? await supabase.rpc("has_permission", { uid: current.user.id, perm: "manage_people" })
    : { data: false };
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

  const hasFilters = Boolean(params.q || params.department || params.availability || params.skill);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">People</h1>
        {canManage && <PersonFormDialog />}
      </div>

      <PeopleFilters departmentOptions={departmentOptions} skillOptions={skillOptions} />

      {error ? (
        <p className="text-destructive">Failed to load people. Try again.</p>
      ) : rows.length === 0 ? (
        <EmptyState hasFilters={hasFilters} />
      ) : (
        <PeopleTable rows={rows} canManage={canManage} />
      )}
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
      {hasFilters ? "No people match your filters." : "No people yet."}
    </div>
  );
}
