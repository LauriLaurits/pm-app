import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { OverviewDetailsCard } from "./overview-details";
import { OverviewEditDialog } from "./overview-edit-dialog";
import type { ClientOption, PmOption } from "./overview-edit-admin-fields";
import { OverviewNotesCard } from "./overview-notes";
import { OverviewPeopleCard } from "./overview-people";
import { ProjectDangerZone } from "./project-danger-zone";
import { StatusHistory } from "./status-history";
import { StatusUpdateForm } from "./status-update-form";
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
  const [{ data: canEdit }, { data: canEditStatus }] = current
    ? await Promise.all([
        supabase.rpc("has_permission", { uid: current.user.id, perm: "edit_project", project: id }),
        supabase.rpc("has_permission", { uid: current.user.id, perm: "edit_status", project: id }),
      ])
    : [{ data: false }, { data: false }];

  const { data: updates } = await supabase
    .from("project_status_updates")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  // pm_name/owner_name are resolved via `people` (RLS: view_people, granted globally to every
  // seeded role) rather than joining `user_profiles` directly -- same precedent as
  // project_list_rows in 20260715000007_project_views.sql. A direct user_profiles join would
  // null out both names for anyone who isn't that profile's owner or an admin.
  const userIds = [row.pm_id, row.owner_id].filter((v): v is string => !!v);
  const { data: people } = userIds.length
    ? await supabase
        .from("people")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds)
    : { data: [] as { user_id: string | null; full_name: string; avatar_url: string | null }[] };

  const personByUserId = new Map((people ?? []).map((p) => [p.user_id, p]));
  const toPersonRef = (userId: string | null): PersonRef => {
    const person = userId ? personByUserId.get(userId) : undefined;
    return person ? { full_name: person.full_name, avatar_url: person.avatar_url } : null;
  };
  const currentPmName = toPersonRef(row.pm_id)?.full_name ?? "Unassigned";

  // isAdmin gates both the pm_id field (the `protect_project_pm` trigger is the real backstop)
  // and the hard-delete affordance (the "admin delete project" RLS policy is the real backstop
  // there). UX gating only, same as canEdit/canEditStatus above.
  const isAdmin = current?.role === "admin";

  // "view clients" RLS (granted to project_manager/finance/admin) already limits this to
  // whatever this caller can actually see -- same query as the New Project page.
  const { data: clients } = canEdit
    ? await supabase.from("clients").select("id, name").order("name")
    : { data: [] as ClientOption[] };

  // PM reassignment candidates -- only ever needed by an admin (non-admins get a read-only
  // name instead, see PmField). Same "linked user account" precedent as the People tab's
  // add-member candidates.
  const { data: pmCandidateRows } = isAdmin
    ? await supabase.from("people").select("user_id, full_name").not("user_id", "is", null).order("full_name")
    : { data: [] as { user_id: string | null; full_name: string }[] };
  const pmCandidates: PmOption[] = (pmCandidateRows ?? [])
    .filter((p): p is { user_id: string; full_name: string } => !!p.user_id)
    .map((p) => ({ user_id: p.user_id, full_name: p.full_name }));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {canEditStatus && <StatusUpdateForm projectId={row.id} />}
        <StatusHistory updates={(updates ?? []) as StatusUpdateRow[]} />
        <OverviewNotesCard project={row} />
      </div>
      <div className="space-y-4">
        <OverviewDetailsCard
          project={row}
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
        <OverviewPeopleCard pm={toPersonRef(row.pm_id)} owner={toPersonRef(row.owner_id)} />
        <ProjectDangerZone
          projectId={row.id}
          status={row.status}
          canArchive={!!canEdit}
          canDelete={isAdmin}
        />
      </div>
    </div>
  );
}
