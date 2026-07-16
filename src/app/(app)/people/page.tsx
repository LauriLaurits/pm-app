import { createClient } from "@/lib/supabase/server";
import { PeopleFilters } from "./people-filters";
import { PeopleTable } from "./people-table";
import { utilizationClass } from "./types";
import type { PersonWorkloadRow } from "./types";

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

  const rows = ((data ?? []) as PersonWorkloadRow[]).filter(
    (row) =>
      !params.availability ||
      utilizationClass(row.current_allocation_pct ?? 0) === params.availability
  );

  const hasFilters = Boolean(params.q || params.department || params.availability || params.skill);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">People</h1>

      <PeopleFilters departmentOptions={departmentOptions} skillOptions={skillOptions} />

      {error ? (
        <p className="text-destructive">Failed to load people. Try again.</p>
      ) : rows.length === 0 ? (
        <EmptyState hasFilters={hasFilters} />
      ) : (
        <PeopleTable rows={rows} />
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
