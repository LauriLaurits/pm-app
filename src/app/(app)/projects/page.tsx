import { createClient } from "@/lib/supabase/server";
import { ProjectFilters } from "./project-filters";
import { ProjectsCards } from "./projects-cards";
import { ProjectsTable } from "./projects-table";
import { ViewToggle } from "./view-toggle";
import {
  BUDGET_TYPE_OPTIONS, HEALTH_OPTIONS, STATUS_OPTIONS,
} from "./types";
import type { BudgetType, ProjectHealth, ProjectListRow, ProjectStatus } from "./types";

type ProjectsSearchParams = {
  status?: string;
  health?: string;
  budget_type?: string;
  pm?: string;
  client?: string;
  q?: string;
  view?: string;
};

function distinct(values: (string | null)[]) {
  return Array.from(new Set(values.filter((v): v is string => !!v))).sort();
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<ProjectsSearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  // Unfiltered (RLS-only) pass -- just used to build the PM/client filter dropdown
  // options from whatever this caller can actually see.
  const { data: optionRows } = await supabase
    .from("project_list_rows")
    .select("pm_name, client_name");
  const pmOptions = distinct((optionRows ?? []).map((r) => r.pm_name));
  const clientOptions = distinct((optionRows ?? []).map((r) => r.client_name));

  const status = STATUS_OPTIONS.find((s) => s === params.status);
  const health = HEALTH_OPTIONS.find((h) => h === params.health);
  const budgetType = BUDGET_TYPE_OPTIONS.find((b) => b === params.budget_type);

  let query = supabase.from("project_list_rows").select("*");
  if (status) query = query.eq("status", status satisfies ProjectStatus);
  if (health) query = query.eq("health", health satisfies ProjectHealth);
  if (budgetType) query = query.eq("budget_type", budgetType satisfies BudgetType);
  if (params.pm) query = query.eq("pm_name", params.pm);
  if (params.client) query = query.eq("client_name", params.client);
  if (params.q) {
    // Strip PostgREST filter metacharacters so a search term can't inject predicates.
    const term = params.q.replace(/[,()*\\]/g, " ").trim();
    if (term) query = query.or(`name.ilike.%${term}%,client_name.ilike.%${term}%`);
  }

  const { data: rows, error } = await query.order("updated_at", { ascending: false });

  const view = params.view === "cards" ? "cards" : "table";
  const hasFilters = Boolean(
    params.status || params.health || params.budget_type || params.pm || params.client || params.q
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <ViewToggle view={view} />
      </div>

      <ProjectFilters pmOptions={pmOptions} clientOptions={clientOptions} />

      {error ? (
        <p className="text-destructive">Failed to load projects. Try again.</p>
      ) : !rows || rows.length === 0 ? (
        <EmptyState hasFilters={hasFilters} />
      ) : view === "cards" ? (
        <ProjectsCards rows={rows as ProjectListRow[]} />
      ) : (
        <ProjectsTable rows={rows as ProjectListRow[]} />
      )}
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
      {hasFilters ? "No projects match your filters." : "No projects yet."}
    </div>
  );
}
