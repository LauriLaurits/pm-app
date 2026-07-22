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

  // Row-dependent lookups in one parallel wave: names, plus the manager-only candidate list.
  // NOTE: allocation (assignments) is deliberately NOT fetched here any more -- the plumbing
  // stays in the DB because the workload views read it, but the Team tab no longer shows or
  // writes it (client feedback: days/week is gone from this tab).
  const [{ data: peopleRows }, { data: allPeople }] = await Promise.all([
    // Names resolved via `people` (RLS: view_people, granted globally to every seeded role) --
    // same precedent as Overview's pm/owner names and the Parts tab's responsible person.
    userIds.length
      ? supabase.from("people").select("id, user_id, full_name, avatar_url").in("user_id", userIds)
      : Promise.resolve({
          data: [] as { id: string; user_id: string | null; full_name: string; avatar_url: string | null }[],
        }),
    // Candidates for the add-person picker -- every person with a linked user_id
    // (project_members.user_id -> user_profiles, required to be addable at all), whether or not
    // they're already a member; first-add UIs filter to memberId === null, additional periods
    // for existing members go through the per-row "Add period" action. Only fetched for managers.
    canManageMembers
      ? supabase
          .from("people")
          .select("user_id, full_name, avatar_url")
          .not("user_id", "is", null)
          .order("full_name")
      : Promise.resolve({ data: [] as { user_id: string | null; full_name: string; avatar_url: string | null }[] }),
  ]);

  const memberIdByUserId = new Map((members ?? []).map((m) => [m.user_id, m.id]));
  const candidates: CandidateOption[] = (allPeople ?? [])
    .filter((p): p is { user_id: string; full_name: string; avatar_url: string | null } => !!p.user_id)
    .map((p) => ({
      user_id: p.user_id,
      full_name: p.full_name,
      avatar_url: p.avatar_url,
      memberId: memberIdByUserId.get(p.user_id) ?? null,
    }));

  const personByUserId = new Map((peopleRows ?? []).map((p) => [p.user_id, p]));

  // One row per membership PERIOD (a person can appear several times since member periods),
  // sorted by person then starts_on -- undated periods first, they read as "since the start".
  const memberRows: MemberRow[] = (members ?? [])
    .map((m: ProjectMemberRow) => {
      const person = personByUserId.get(m.user_id);
      return {
        ...m,
        full_name: person?.full_name ?? null,
        avatar_url: person?.avatar_url ?? null,
        person_id: person?.id ?? null,
      };
    })
    .sort(
      (a, b) =>
        (a.full_name ?? "").localeCompare(b.full_name ?? "") ||
        (a.starts_on ?? "").localeCompare(b.starts_on ?? "")
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Team</h2>
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
