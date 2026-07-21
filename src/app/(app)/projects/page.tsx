import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { ProjectFilters } from "./project-filters";
import { ProjectsCards } from "./projects-cards";
import { deriveProgress, progressBasisLabel, type ProgressPart } from "@/lib/progress";
import { ProjectsTable, type ProjectRowLinks } from "./projects-table";
import { ViewToggle } from "./view-toggle";
import {
  BUDGET_TYPE_OPTIONS, STATUS_OPTIONS,
} from "./types";
import type { BudgetType, ProjectListRow, ProjectStatus } from "./types";

type ProjectsSearchParams = {
  status?: string;
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

  // UX gating only -- the real security boundary is requirePermission() inside
  // createProjectAction, which re-checks has_permission('create_project') server-side
  // regardless of what's rendered here.
  const current = await getCurrentUser();
  const { data: canCreate } = current
    ? await supabase.rpc("has_permission", { uid: current.user.id, perm: "create_project" })
    : { data: false };

  // Unfiltered (RLS-only) pass -- just used to build the PM/client filter dropdown
  // options from whatever this caller can actually see.
  const { data: optionRows } = await supabase
    .from("project_list_rows")
    .select("pm_name, client_name");
  const pmOptions = distinct((optionRows ?? []).map((r) => r.pm_name));
  const clientOptions = distinct((optionRows ?? []).map((r) => r.client_name));

  const status = STATUS_OPTIONS.find((s) => s === params.status);
  const budgetType = BUDGET_TYPE_OPTIONS.find((b) => b === params.budget_type);

  let query = supabase.from("project_list_rows").select("*");
  if (status) query = query.eq("status", status satisfies ProjectStatus);
  if (budgetType) query = query.eq("budget_type", budgetType satisfies BudgetType);
  if (params.pm) query = query.eq("pm_name", params.pm);
  if (params.client) query = query.eq("client_name", params.client);
  if (params.q) {
    // Strip PostgREST filter metacharacters so a search term can't inject predicates.
    const term = params.q.replace(/[,()*\\]/g, " ").trim();
    if (term) query = query.or(`name.ilike.%${term}%,client_name.ilike.%${term}%`);
  }

  const { data: rows, error } = await query.order("updated_at", { ascending: false });

  // UX gating only for the inline status/health/priority editors -- InlineEditSelect renders a
  // plain badge for any row not in this set, but the real boundary is requirePermission inside
  // updateProjectFieldAction, re-checked server-side regardless of what's rendered here. Mirrors
  // has_permission('edit_project', project) exactly without an RPC round trip per row: admin
  // bypasses everything; project_manager holds edit_project only with scope 'own_projects'
  // (pm_id = uid); no other seeded role holds edit_project at all; user_project_permissions
  // covers the remaining ad-hoc-grant case (e.g. a viewer given edit_project on one project).
  const editableProjectIds = new Set<string>();
  const projectIds = (rows ?? []).map((r) => r.id).filter((id): id is string => !!id);
  if (current && projectIds.length > 0) {
    if (current.role === "admin") {
      for (const id of projectIds) editableProjectIds.add(id);
    } else {
      const [{ data: pmRows }, { data: adhocGrants }] = await Promise.all([
        current.role === "project_manager"
          ? supabase.from("projects").select("id, pm_id").in("id", projectIds)
          : Promise.resolve({ data: [] as { id: string; pm_id: string | null }[] }),
        supabase
          .from("user_project_permissions")
          .select("project_id, expires_at")
          .eq("user_id", current.user.id)
          .eq("permission_key", "edit_project")
          .in("project_id", projectIds),
      ]);
      for (const p of pmRows ?? []) {
        if (p.pm_id === current.user.id) editableProjectIds.add(p.id);
      }
      const now = new Date();
      for (const g of adhocGrants ?? []) {
        if (!g.expires_at || new Date(g.expires_at) > now) editableProjectIds.add(g.project_id);
      }
    }
  }

  // Cross-link targets: the list view carries names only, so resolve client ids and the PM's
  // people-directory id here (RLS-scoped -- rows the viewer can't see simply stay unlinked).
  const links: ProjectRowLinks = {};
  if (projectIds.length > 0) {
    const [{ data: projectRefs }, { data: peopleRefs }] = await Promise.all([
      supabase.from("projects").select("id, client_id, pm_id").in("id", projectIds),
      supabase.from("people").select("id, user_id").not("user_id", "is", null),
    ]);
    const personIdByUserId = new Map(
      (peopleRefs ?? []).map((p) => [p.user_id as string, p.id])
    );
    for (const p of projectRefs ?? []) {
      links[p.id] = {
        clientId: p.client_id,
        pmPersonId: p.pm_id ? (personIdByUserId.get(p.pm_id) ?? null) : null,
      };
    }
  }

  // Derived progress for the list -- the same deriveProgress the project page uses, so the list
  // never shows the deprecated hand-typed `progress` column while the detail shows parts-derived.
  const progressById: Record<string, { pct: number | null; label: string }> = {};
  if (projectIds.length > 0) {
    const { data: partRows } = await supabase
      .from("project_parts")
      .select("project_id, status, estimated_hours")
      .in("project_id", projectIds);
    const partsByProject = new Map<string, ProgressPart[]>();
    for (const p of partRows ?? []) {
      const list = partsByProject.get(p.project_id) ?? [];
      list.push({ status: p.status, estimated_hours: p.estimated_hours });
      partsByProject.set(p.project_id, list);
    }
    for (const id of projectIds) {
      const derived = deriveProgress(partsByProject.get(id) ?? []);
      progressById[id] = { pct: derived.pct, label: progressBasisLabel(derived) };
    }
  }

  const view = params.view === "cards" ? "cards" : "table";
  const hasFilters = Boolean(
    params.status || params.budget_type || params.pm || params.client || params.q
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} />
          {canCreate && (
            <Button size="sm" render={<Link href="/projects/new" />}>
              New project
            </Button>
          )}
        </div>
      </div>

      <ProjectFilters pmOptions={pmOptions} clientOptions={clientOptions} />

      {error ? (
        <p className="text-destructive">Failed to load projects. Try again.</p>
      ) : !rows || rows.length === 0 ? (
        <EmptyState hasFilters={hasFilters} canCreate={!!canCreate} />
      ) : view === "cards" ? (
        <ProjectsCards rows={rows as ProjectListRow[]} />
      ) : (
        <ProjectsTable
          rows={rows as ProjectListRow[]}
          editableProjectIds={[...editableProjectIds]}
          links={links}
          progressById={progressById}
        />
      )}
    </div>
  );
}

function EmptyState({ hasFilters, canCreate }: { hasFilters: boolean; canCreate: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-12 text-center text-muted-foreground">
      <p>{hasFilters ? "No projects match your filters." : "No projects yet."}</p>
      {!hasFilters && canCreate && (
        <Button size="sm" render={<Link href="/projects/new" />}>
          Create your first project
        </Button>
      )}
    </div>
  );
}
