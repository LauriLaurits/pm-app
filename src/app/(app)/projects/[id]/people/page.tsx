import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AddPersonDialog } from "./add-person-dialog";
import { MembersTable } from "./members-table";
import type { CandidateOption, MemberRow, ProjectMemberRow } from "./types";

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

  // One parallel round trip for the permission check and the member list (perf feedback: these
  // used to run in series, each adding a full DB round trip to TTFB).
  // "view team" RLS on project_members already limits the list to callers with view_team on
  // this project (global for PM/finance, member_projects for a plain member on their own).
  const [{ data: canManageMembers }, { data: members }] = await Promise.all([
    current
      ? supabase.rpc("has_permission", {
          uid: current.user.id,
          perm: "manage_project_members",
          project: id,
        })
      : Promise.resolve({ data: false }),
    supabase
      .from("project_members")
      .select("*")
      .eq("project_id", id)
      .order("id", { ascending: true }),
  ]);

  const userIds = [...new Set((members ?? []).map((m) => m.user_id))];

  // Row-dependent lookups run as one parallel wave: the names -> allocations chain (allocations
  // need the person ids resolved from names) and the manager-only candidate list are independent
  // of each other.
  let peopleRows: { id: string; user_id: string | null; full_name: string; avatar_url: string | null }[] = [];
  const allocationByPersonId = new Map<string, number>();
  let candidates: CandidateOption[] = [];
  await Promise.all([
    (async () => {
      // Names resolved via `people` (RLS: view_people, granted globally to every seeded role) --
      // same precedent as Overview's pm/owner names and the Parts tab's responsible person.
      const { data } = userIds.length
        ? await supabase.from("people").select("id, user_id, full_name, avatar_url").in("user_id", userIds)
        : { data: [] as { id: string; user_id: string | null; full_name: string; avatar_url: string | null }[] };
      peopleRows = data ?? [];
      const personIds = peopleRows.map((p) => p.id);

      // Allocation % from `assignments`, summed per person across every part of this project.
      const { data: assignments } = personIds.length
        ? await supabase
            .from("assignments")
            .select("person_id, allocation_pct")
            .eq("project_id", id)
            .in("person_id", personIds)
        : { data: [] as { person_id: string; allocation_pct: number }[] };
      for (const a of assignments ?? []) {
        allocationByPersonId.set(a.person_id, (allocationByPersonId.get(a.person_id) ?? 0) + a.allocation_pct);
      }
    })(),
    (async () => {
      // Candidates for the "Manage members" checklist -- every person with a linked user_id
      // (project_members.user_id -> user_profiles, required to be addable at all), whether or not
      // they're already a member: the checklist shows everyone with their current membership as the
      // checkbox state, rather than only offering not-yet-added people like the old "Add member"
      // picker did. Only fetched for managers.
      if (canManageMembers) {
        const memberIdByUserId = new Map((members ?? []).map((m) => [m.user_id, m.id]));
        const { data: allPeople } = await supabase
          .from("people")
          .select("user_id, full_name, avatar_url")
          .not("user_id", "is", null)
          .order("full_name");
        candidates = (allPeople ?? [])
          .filter((p): p is { user_id: string; full_name: string; avatar_url: string | null } => !!p.user_id)
          .map((p) => ({
            user_id: p.user_id,
            full_name: p.full_name,
            avatar_url: p.avatar_url,
            memberId: memberIdByUserId.get(p.user_id) ?? null,
          }));
      }
    })(),
  ]);
  const personByUserId = new Map(peopleRows.map((p) => [p.user_id, p]));

  const memberRows: MemberRow[] = (members ?? []).map((m: ProjectMemberRow) => {
    const person = personByUserId.get(m.user_id);
    return {
      ...m,
      full_name: person?.full_name ?? null,
      avatar_url: person?.avatar_url ?? null,
      allocation_pct: person ? allocationByPersonId.get(person.id) ?? null : null,
      person_id: person?.id ?? null,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">People</h2>
        {canManageMembers && (
          <AddPersonDialog
            projectId={id}
            candidates={candidates.filter((c) => c.memberId === null)}
          />
        )}
      </div>
      <MembersTable members={memberRows} projectId={id} canManage={!!canManageMembers} />
    </div>
  );
}
