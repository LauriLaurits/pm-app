import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { OverviewDetailsCard } from "./overview-details";
import { OverviewEditDialog } from "./overview-edit-dialog";
import { OverviewNotesCard } from "./overview-notes";
import { OverviewPeopleCard } from "./overview-people";
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
          editAction={canEdit ? <OverviewEditDialog project={row} /> : null}
        />
        <OverviewPeopleCard pm={toPersonRef(row.pm_id)} owner={toPersonRef(row.owner_id)} />
      </div>
    </div>
  );
}
