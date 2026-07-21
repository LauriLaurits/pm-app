import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { deriveProgress } from "@/lib/progress";
import { OverviewDetailsCard } from "./overview-details";
import { OverviewEditDialog } from "./overview-edit-dialog";
import type { ClientOption, PmOption } from "./overview-edit-admin-fields";
import { OverviewNotesCard } from "./overview-notes";
import { ProjectHeaderStrip, type ProjectBudgetCell } from "./project-header";
import { ProjectDangerZone } from "./project-danger-zone";
import { StatusHistory } from "./status-history";
import { StatusUpdateDialog } from "./status-update-dialog";
import type { PersonRef, ProjectRow, StatusUpdateRow } from "./types";

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!project) notFound();
  const row = project as ProjectRow;

  // UX gating only -- purely decides whether to render the edit/status forms at all.
  // The real security boundary is requirePermission() inside each server action, which
  // re-checks has_permission server-side before any write regardless of what's rendered here.
  const current = await getCurrentUser();

  // isAdmin gates both the pm_id field (the `protect_project_pm` trigger is the real backstop)
  // and the hard-delete affordance (the "admin delete project" RLS policy is the real backstop
  // there). UX gating only, same as canEdit/canEditStatus below.
  const isAdmin = current?.role === "admin";

  // pm_name/owner_name are resolved via `people` (RLS: view_people, granted globally to every
  // seeded role) rather than joining `user_profiles` directly -- same precedent as
  // project_list_rows in 20260715000007_project_views.sql. A direct user_profiles join would
  // null out both names for anyone who isn't that profile's owner or an admin.
  const userIds = [row.pm_id, row.owner_id].filter((v): v is string => !!v);

  // One parallel round trip for everything that only depends on the project row / viewer (perf
  // feedback: these used to run in series, each adding a full DB round trip to TTFB).
  // Header-strip inputs: progress is derived from part statuses (never the manual column); the
  // budget row's finance columns are RLS-nulled for a non-finance caller (so the Budget cell is
  // simply omitted for them); team is a headcount of project_members. PM reassignment candidates
  // are only ever needed by an admin (non-admins get a read-only name instead, see PmField) --
  // same "linked user account" precedent as the People tab's add-member candidates.
  const [
    { data: canEdit },
    { data: canEditStatus },
    { data: updates },
    { data: parts },
    { data: budgetRow },
    { count: teamCount },
    { data: people },
    { data: pmCandidateRows },
  ] = await Promise.all([
    current
      ? supabase.rpc("has_permission", { uid: current.user.id, perm: "edit_project", project: id })
      : Promise.resolve({ data: false }),
    current
      ? supabase.rpc("has_permission", { uid: current.user.id, perm: "edit_status", project: id })
      : Promise.resolve({ data: false }),
    supabase
      .from("project_status_updates")
      .select("*")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("project_parts").select("status, estimated_hours").eq("project_id", id),
    supabase
      .from("project_budget_rows")
      .select("client_amount, invoiced, consumption_pct")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("project_members").select("id", { count: "exact", head: true }).eq("project_id", id),
    userIds.length
      ? supabase
          .from("people")
          .select("id, user_id, full_name, avatar_url")
          .in("user_id", userIds)
      : Promise.resolve({ data: [] as { id: string; user_id: string | null; full_name: string; avatar_url: string | null }[] }),
    isAdmin
      ? supabase.from("people").select("user_id, full_name").not("user_id", "is", null).order("full_name")
      : Promise.resolve({ data: [] as { user_id: string | null; full_name: string }[] }),
  ]);

  const progress = deriveProgress(
    (parts ?? []).map((p) => ({ status: p.status as string, estimated_hours: p.estimated_hours }))
  );
  const budgetCell: ProjectBudgetCell =
    budgetRow && budgetRow.client_amount !== null
      ? {
          clientAmount: budgetRow.client_amount,
          invoiced: budgetRow.invoiced ?? 0,
          consumptionPct: budgetRow.consumption_pct,
        }
      : null;

  const personByUserId = new Map((people ?? []).map((p) => [p.user_id, p]));
  const toPersonRef = (userId: string | null): PersonRef => {
    const person = userId ? personByUserId.get(userId) : undefined;
    return person
      ? { full_name: person.full_name, avatar_url: person.avatar_url, person_id: person.id }
      : null;
  };
  const currentPmName = toPersonRef(row.pm_id)?.full_name ?? "Unassigned";

  // "view clients" RLS (granted to project_manager/finance/admin) already limits this to
  // whatever this caller can actually see -- same query as the New Project page. Depends on
  // canEdit, so it can't join the wave above.
  const { data: clients } = canEdit
    ? await supabase.from("clients").select("id, name").order("name")
    : { data: [] as ClientOption[] };

  const pmCandidates: PmOption[] = (pmCandidateRows ?? [])
    .filter((p): p is { user_id: string; full_name: string } => !!p.user_id)
    .map((p) => ({ user_id: p.user_id, full_name: p.full_name }));

  return (
    <div className="space-y-4">
      <ProjectHeaderStrip
        progress={progress}
        deadline={row.deadline}
        budget={budgetCell}
        teamCount={teamCount ?? 0}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <StatusHistory
            updates={(updates ?? []) as StatusUpdateRow[]}
            postAction={canEditStatus ? <StatusUpdateDialog projectId={row.id} /> : null}
          />
          <OverviewNotesCard project={row} />
        </div>
        <div className="space-y-4">
          <OverviewDetailsCard
            project={row}
            pm={toPersonRef(row.pm_id)}
            owner={toPersonRef(row.owner_id)}
            editAction={
              canEdit ? (
                <OverviewEditDialog
                  project={row}
                  clients={(clients ?? []) as ClientOption[]}
                  isAdmin={isAdmin}
                  pmCandidates={pmCandidates}
                  currentPmName={currentPmName}
                />
              ) : null
            }
          />
          <ProjectDangerZone
            projectId={row.id}
            status={row.status}
            canArchive={!!canEdit}
            canDelete={isAdmin}
          />
        </div>
      </div>
    </div>
  );
}
