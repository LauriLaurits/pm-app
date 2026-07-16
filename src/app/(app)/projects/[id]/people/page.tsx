import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AddMemberDialog } from "./add-member-dialog";
import { MembersTable } from "./members-table";
import type { MemberRow, PersonOption, ProjectMemberRow } from "./types";

export default async function ProjectPeoplePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS ("view project") means a caller without access gets zero rows -- indistinguishable
  // from not existing, which is the point (never leak existence). Layout already 404s too,
  // but this route can be reached directly, so check again here.
  const { data: project } = await supabase.from("projects").select("id").eq("id", id).maybeSingle();
  if (!project) notFound();

  // UX gating only -- the real security boundary is requirePermission() inside
  // addMemberAction/removeMemberAction, which re-checks has_permission server-side
  // regardless of what's rendered here.
  const current = await getCurrentUser();
  const { data: canManageMembers } = current
    ? await supabase.rpc("has_permission", {
        uid: current.user.id,
        perm: "manage_project_members",
        project: id,
      })
    : { data: false };

  // "view team" RLS on project_members already limits this to callers with view_team on
  // this project (global for PM/finance, member_projects for a plain member on their own).
  const { data: members } = await supabase
    .from("project_members")
    .select("*")
    .eq("project_id", id)
    .order("id", { ascending: true });

  const userIds = [...new Set((members ?? []).map((m) => m.user_id))];

  // Names resolved via `people` (RLS: view_people, granted globally to every seeded role) --
  // same precedent as Overview's pm/owner names and the Parts tab's responsible person.
  const { data: peopleRows } = userIds.length
    ? await supabase.from("people").select("id, user_id, full_name, avatar_url").in("user_id", userIds)
    : { data: [] as { id: string; user_id: string | null; full_name: string; avatar_url: string | null }[] };
  const personByUserId = new Map((peopleRows ?? []).map((p) => [p.user_id, p]));
  const personIds = (peopleRows ?? []).map((p) => p.id);

  // Allocation % from `assignments`, summed per person across every part of this project.
  const { data: assignments } = personIds.length
    ? await supabase
        .from("assignments")
        .select("person_id, allocation_pct")
        .eq("project_id", id)
        .in("person_id", personIds)
    : { data: [] as { person_id: string; allocation_pct: number }[] };
  const allocationByPersonId = new Map<string, number>();
  for (const a of assignments ?? []) {
    allocationByPersonId.set(a.person_id, (allocationByPersonId.get(a.person_id) ?? 0) + a.allocation_pct);
  }

  const memberRows: MemberRow[] = (members ?? []).map((m: ProjectMemberRow) => {
    const person = personByUserId.get(m.user_id);
    return {
      ...m,
      full_name: person?.full_name ?? null,
      avatar_url: person?.avatar_url ?? null,
      allocation_pct: person ? allocationByPersonId.get(person.id) ?? null : null,
    };
  });

  // Candidates for the add-member picker -- only fetched for managers. A person needs a
  // linked user_id (project_members.user_id -> user_profiles) to be addable at all.
  let candidates: PersonOption[] = [];
  if (canManageMembers) {
    const { data: allPeople } = await supabase
      .from("people")
      .select("user_id, full_name")
      .not("user_id", "is", null)
      .order("full_name");
    const existing = new Set(userIds);
    candidates = (allPeople ?? [])
      .filter((p): p is { user_id: string; full_name: string } => !!p.user_id && !existing.has(p.user_id))
      .map((p) => ({ user_id: p.user_id, full_name: p.full_name }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">People</h2>
        {canManageMembers && <AddMemberDialog projectId={id} candidates={candidates} />}
      </div>
      <MembersTable members={memberRows} projectId={id} canManage={!!canManageMembers} />
    </div>
  );
}
