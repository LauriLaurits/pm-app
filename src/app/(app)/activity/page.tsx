import { createClient } from "@/lib/supabase/server";
import { requireActiveUser } from "@/lib/auth/session";
import { ActivityFilters } from "./activity-filters";
import { ActivityTable } from "./activity-table";
import { ActivityPagination } from "./activity-pagination";
import { PAGE_SIZE, nextDayIso, resolveProjectId } from "./types";
import type { ActivityListItem, AuditLogRow, ProjectOption } from "./types";

type ActivitySearchParams = {
  actor?: string;
  action?: string;
  resource_type?: string;
  project?: string;
  from?: string;
  to?: string;
  page?: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<ActivitySearchParams>;
}) {
  const params = await searchParams;
  const current = await requireActiveUser();
  const supabase = await createClient();

  // UX gating only, mirrors AdminAccessPage's pattern -- RLS (the "view_audit holders read audit
  // logs" policy, additive to the existing admin-only one) is what actually enforces this; a
  // caller who fails this check would see zero rows below regardless, but this gives them a clear
  // reason instead of a confusingly-empty table.
  const { data: canView } = await supabase.rpc("has_permission", {
    uid: current.user.id,
    perm: "view_audit",
  });

  if (!canView) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Activity log</h1>
        <p className="text-muted-foreground">
          You don&apos;t have access to this page. The activity log is restricted to admins and view_audit holders.
        </p>
      </div>
    );
  }

  const { data: projectRows } = await supabase.from("projects").select("id, name").order("name");
  const projects: ProjectOption[] = projectRows ?? [];
  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  // Filter option lists are derived from a bounded recent sample rather than a true SQL DISTINCT
  // (no view/RPC exists for this and one row of "actor picker" isn't worth a migration) -- fine for
  // a ~25-person shop; it just means a filter value that hasn't occurred in the last 2000 events
  // won't appear as an option (the filter still works if typed into the URL directly).
  const { data: sampleRows } = await supabase
    .from("audit_logs")
    .select("actor_email, action, resource_type")
    .order("created_at", { ascending: false })
    .limit(2000);
  const actors = [...new Set((sampleRows ?? []).map((r) => r.actor_email).filter((v): v is string => !!v))].sort();
  const actions = [...new Set((sampleRows ?? []).map((r) => r.action))].sort();
  const resourceTypes = [
    ...new Set((sampleRows ?? []).map((r) => r.resource_type).filter((v): v is string => !!v)),
  ].sort();

  // project id must be one we actually know about -- guards the .or() filter string below from
  // anything but a recognized id, since it's built from a URL param.
  const validProjectId = params.project && projects.some((p) => p.id === params.project) ? params.project : undefined;
  const validFrom = params.from && DATE_RE.test(params.from) ? params.from : undefined;
  const validTo = params.to && DATE_RE.test(params.to) ? params.to : undefined;

  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE); // fetch one extra row to detect a next page
  if (params.actor) query = query.eq("actor_email", params.actor);
  if (params.action) query = query.eq("action", params.action);
  if (params.resource_type) query = query.eq("resource_type", params.resource_type);
  if (validFrom) query = query.gte("created_at", `${validFrom}T00:00:00.000Z`);
  if (validTo) query = query.lt("created_at", nextDayIso(validTo));
  if (validProjectId) {
    // project.* actions store the project id itself in resource_id; everything else (that
    // resolves to a project at all) stores it under metadata.project_id -- see writeAudit call
    // sites across src/app/actions/*.
    query = query.or(`metadata->>project_id.eq.${validProjectId},and(resource_type.eq.project,resource_id.eq.${validProjectId})`);
  }
  const { data: rows } = await query;
  const allRows: AuditLogRow[] = rows ?? [];
  const hasMore = allRows.length > PAGE_SIZE;
  const pageRows = allRows.slice(0, PAGE_SIZE);

  const items: ActivityListItem[] = pageRows.map((row) => {
    const projectId = resolveProjectId(row);
    return { ...row, project_name: projectId ? (projectNameById.get(projectId) ?? null) : null };
  });

  const hasFilters = Boolean(
    params.actor || params.action || params.resource_type || validProjectId || validFrom || validTo,
  );
  const baseParams = new URLSearchParams();
  if (params.actor) baseParams.set("actor", params.actor);
  if (params.action) baseParams.set("action", params.action);
  if (params.resource_type) baseParams.set("resource_type", params.resource_type);
  if (validProjectId) baseParams.set("project", validProjectId);
  if (validFrom) baseParams.set("from", validFrom);
  if (validTo) baseParams.set("to", validTo);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Activity log</h1>
      <ActivityFilters actors={actors} actions={actions} resourceTypes={resourceTypes} projects={projects} />

      {items.length === 0 ? (
        <EmptyState hasFilters={hasFilters} />
      ) : (
        <>
          <ActivityTable items={items} />
          <ActivityPagination page={page} hasMore={hasMore} baseQuery={baseParams.toString()} />
        </>
      )}
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
      {hasFilters ? "No activity matches these filters." : "No activity recorded yet."}
    </div>
  );
}
