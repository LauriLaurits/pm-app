import Link from "next/link";
import {
  AlertTriangle, CircleCheckBig, Clock, FolderKanban, Wallet, type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectFilters } from "./project-filters";
import { ProjectsCards } from "./projects-cards";
import { deriveHealth } from "@/lib/health";
import { formatMoney } from "@/lib/budget";
import { deriveProgress, type ProgressPart } from "@/lib/progress";
import { ProjectsTable, type ProjectRowLinks } from "./projects-table";
import { ViewToggle } from "./view-toggle";
import {
  BUDGET_TYPE_OPTIONS, STATUS_OPTIONS,
} from "./types";
import type { BudgetType, ProjectListRow, ProjectStatus } from "./types";

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

function round1(n: number) {
  return Math.round(n * 10) / 10;
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
  // options from whatever this caller can actually see. PM options carry the avatar so the
  // dropdown items look like the table's PM cells.
  const { data: optionRows } = await supabase
    .from("project_list_rows")
    .select("pm_name, pm_avatar_url, client_name");
  const pmAvatarByName = new Map<string, string | null>();
  for (const r of optionRows ?? []) {
    if (r.pm_name && !pmAvatarByName.has(r.pm_name)) pmAvatarByName.set(r.pm_name, r.pm_avatar_url);
  }
  const pmOptions = [...pmAvatarByName.entries()]
    .map(([name, avatarUrl]) => ({ name, avatarUrl }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
  let plannedHours = 0;
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
      plannedHours += p.estimated_hours ?? 0;
    }
    for (const id of projectIds) {
      const derived = deriveProgress(partsByProject.get(id) ?? []);
      // Compact list label ("80 / 950 h"); the long form (progressBasisLabel) stays on detail pages.
      const label =
        derived.basis === "hours"
          ? `${round1(derived.doneHours)} / ${round1(derived.totalHours)} h`
          : derived.basis === "count"
            ? `${derived.donePartCount} / ${derived.totalPartCount} parts`
            : "No parts yet";
      progressById[id] = { pct: derived.pct, label };
    }
  }

  // Muted summary strip under the title: portfolio at a glance without leaving the list.
  // At-risk derives the same way the table's Health column does; budget total only renders
  // when this viewer can actually see budget numbers (RLS nulls them otherwise).
  const validRows = (rows ?? []).filter((r): r is ProjectListRow & { id: string } => !!r.id);
  const levelById = new Map(
    validRows.map((r) => [
      r.id,
      deriveHealth({
        status: r.status,
        startDate: r.start_date,
        deadline: r.deadline,
        consumptionPct:
          r.budget_total && r.budget_used !== null ? (r.budget_used / r.budget_total) * 100 : null,
        progressPct: progressById[r.id]?.pct ?? null,
      }).level,
    ])
  );
  const activeCount = validRows.filter((r) => r.status === "active").length;
  const atRiskCount = validRows.filter((r) => levelById.get(r.id) !== "healthy").length;

  // Health filter is applied HERE (not in the DB query): health is derived, so the stored
  // column can't be filtered server-side. Summary metrics above stay portfolio-wide.
  const healthParam =
    params.health === "healthy" || params.health === "warning" || params.health === "critical"
      ? params.health
      : undefined;
  const displayRows = healthParam
    ? validRows.filter((r) => levelById.get(r.id) === healthParam)
    : validRows;
  const budgetRows = validRows.filter((r) => r.budget_total !== null);
  const totalBudget = budgetRows.length
    ? budgetRows.reduce((sum, r) => sum + (r.budget_total ?? 0), 0)
    : null;

  const view = params.view === "cards" ? "cards" : "table";
  const hasFilters = Boolean(
    params.status || params.health || params.budget_type || params.pm || params.client || params.q
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          {validRows.length > 0 && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {validRows.length} project{validRows.length === 1 ? "" : "s"}
              <span className="mx-1.5 text-border">·</span>
              {activeCount} active
              <span className="mx-1.5 text-border">·</span>
              {atRiskCount} at risk
              {totalBudget !== null && (
                <>
                  <span className="mx-1.5 text-border">·</span>
                  {formatMoney(totalBudget)} budget
                </>
              )}
              {plannedHours > 0 && (
                <>
                  <span className="mx-1.5 text-border">·</span>
                  {Math.round(plannedHours).toLocaleString("en-US")} planned hours
                </>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} />
          {canCreate && (
            <Button size="sm" render={<Link href="/projects/new" />}>
              New project
            </Button>
          )}
        </div>
      </div>

      {validRows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatCard icon={FolderKanban} label="Total projects" value={String(validRows.length)} iconClass="bg-blue-500/10 text-blue-600 dark:text-blue-400" />
          <StatCard icon={CircleCheckBig} label="Active projects" value={String(activeCount)} iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" />
          <StatCard icon={AlertTriangle} label="At risk" value={String(atRiskCount)} iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-400" />
          {totalBudget !== null && (
            <StatCard icon={Wallet} label="Total budget" value={formatMoney(totalBudget)} iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-400" />
          )}
          {plannedHours > 0 && (
            <StatCard icon={Clock} label="Planned hours" value={`${Math.round(plannedHours).toLocaleString("en-US")} h`} iconClass="bg-blue-500/10 text-blue-600 dark:text-blue-400" />
          )}
        </div>
      )}

      <ProjectFilters pmOptions={pmOptions} clientOptions={clientOptions} />

      {error ? (
        <p className="text-destructive">Failed to load projects. Try again.</p>
      ) : displayRows.length === 0 ? (
        <EmptyState hasFilters={hasFilters} canCreate={!!canCreate} />
      ) : view === "cards" ? (
        <ProjectsCards rows={displayRows} progressById={progressById} />
      ) : (
        <ProjectsTable
          rows={displayRows}
          editableProjectIds={[...editableProjectIds]}
          links={links}
          progressById={progressById}
        />
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  iconClass,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  iconClass: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="text-xl leading-tight font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
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
