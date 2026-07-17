import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import type { PersonWorkloadRow } from "../types";
import { CapacitySummaryCard } from "./capacity-summary-card";
import { CurrentProjectsCard } from "./current-projects-card";
import { FinancialsCard } from "./financials-card";
import { resolveLogTimeData } from "./log-time-data";
import { LogTimeDialog } from "./log-time-dialog";
import { PersonHeader } from "./person-header";
import { RecentHoursCard } from "./recent-hours-card";
import { SkillsCard } from "./skills-card";
import { TimeOffCard } from "./time-off-card";
import type {
  AssignedProjectOption,
  AssignmentWithProject,
  PartOption,
  PersonSkillRow,
  SkillOption,
  TimeEntryWithProject,
  TimeOffRow,
} from "./types";

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // "view people" RLS (view_people permission, granted globally to every seeded role) means a
  // caller without access simply gets zero rows back here -- not an error. That is
  // indistinguishable from the person not existing, which is the point: never leak existence.
  const { data: person } = await supabase
    .from("person_workload_rows")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!person) notFound();
  const row = person as PersonWorkloadRow;

  // "view assignments" / "read own time" / "view time_off" / "view person_skills" RLS already
  // scopes each of these to whatever the caller may see -- this page does not widen any of
  // that. current_person_id() also tells us if the VIEWER is on their OWN page -- the log-time
  // form/delete controls are only ever wired in for that case (everyone else gets a read-only list).
  const [
    { data: assignmentRows },
    { data: timeEntryRows },
    { data: timeOffRows },
    { data: skillRows },
    { data: myPersonId },
  ] = await Promise.all([
    supabase
      .from("assignments")
      .select("*")
      .eq("person_id", id)
      .order("start_date", { ascending: false }),
    supabase
      .from("time_entries")
      .select("*")
      .eq("person_id", id)
      .order("entry_date", { ascending: false })
      .limit(20),
    supabase
      .from("time_off")
      .select("*")
      .eq("person_id", id)
      .order("starts_on", { ascending: false }),
    supabase
      .from("person_skills")
      .select("skill_id, level, skills(name, category)")
      .eq("person_id", id),
    supabase.rpc("current_person_id"),
  ]);
  const isOwnPage = myPersonId === id;

  // UX gating only -- the real security boundary is requirePermission("manage_people") inside
  // addPersonSkillAction/removePersonSkillAction/setPersonSkillLevelAction/upsertTimeOffAction/
  // deleteTimeOffAction, which re-checks has_permission server-side regardless of what's
  // rendered here. Same pattern as the People list page's canManage.
  const viewer = await getCurrentUser();
  const { data: canManagePeople } = viewer
    ? await supabase.rpc("has_permission", { uid: viewer.user.id, perm: "manage_people" })
    : { data: false };
  const canManage = !!canManagePeople;

  // Full skills catalog for the "add skill" picker -- only needed by managers, so skip the
  // query entirely for read-only viewers. "view skills" RLS scopes it the same as everywhere
  // else regardless.
  const { data: allSkillRows } = canManage
    ? await supabase.from("skills").select("id, name, category").order("name")
    : { data: [] as SkillOption[] };

  // Project names resolved via a separate `projects` query (RLS: "view project", scoped by
  // has_permission(..., 'view_project', id)) rather than a nested select on assignments/
  // time_entries -- same precedent as pm/owner names on the Project Overview tab and member
  // names on the Project People tab: a caller who can see the assignment row but lacks
  // view_project on that specific project gets a missing name here rather than a join error.
  const projectIds = [
    ...new Set([
      ...(assignmentRows ?? []).map((a) => a.project_id),
      ...(timeEntryRows ?? []).map((t) => t.project_id),
    ]),
  ];
  const { data: projectRows } = projectIds.length
    ? await supabase.from("projects").select("id, name").in("id", projectIds)
    : { data: [] as { id: string; name: string }[] };
  const projectNameById = new Map((projectRows ?? []).map((p) => [p.id, p.name]));

  const assignments: AssignmentWithProject[] = (assignmentRows ?? []).map((a) => ({
    ...a,
    project_name: projectNameById.get(a.project_id) ?? null,
  }));
  const timeEntries: TimeEntryWithProject[] = (timeEntryRows ?? []).map((t) => ({
    ...t,
    project_name: projectNameById.get(t.project_id) ?? null,
  }));

  const today = new Date().toISOString().slice(0, 10);
  const current = assignments.filter(
    (a) => a.start_date <= today && (!a.end_date || a.end_date >= today)
  );
  const upcoming = assignments.filter((a) => a.start_date > today);
  const past = assignments.filter((a) => a.end_date && a.end_date < today);

  // Log-time picker data (own page only) -- projects the viewer is a member of OR assigned to,
  // matching the widened "log own time" RLS policy (see log-time-data.ts).
  const { assignedProjects, partsByProject } = isOwnPage && viewer
    ? await resolveLogTimeData(supabase, viewer.user.id, assignments, projectNameById)
    : { assignedProjects: [] as AssignedProjectOption[], partsByProject: {} as Record<string, PartOption[]> };

  // Finance gating lives entirely in `person_workload_rows` (security_invoker view whose LEFT
  // JOIN onto `rates` is nulled by RLS for non-finance callers) -- this page never reads
  // `rates` directly. Non-null here means the caller already has view_internal_cost.
  const showFinancials = row.internal_cost !== null || row.billing_rate !== null;

  return (
    <div className="space-y-4">
      <PersonHeader person={row} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <CurrentProjectsCard current={current} upcoming={upcoming} past={past} />
          <RecentHoursCard
            entries={timeEntries}
            canManage={isOwnPage}
            projects={assignedProjects}
            partsByProject={partsByProject}
            headerAction={
              isOwnPage ? (
                <LogTimeDialog projects={assignedProjects} partsByProject={partsByProject} />
              ) : undefined
            }
          />
        </div>
        <div className="space-y-4">
          <CapacitySummaryCard person={row} />
          <SkillsCard
            personId={id}
            skills={(skillRows ?? []) as PersonSkillRow[]}
            canManage={canManage}
            allSkills={(allSkillRows ?? []) as SkillOption[]}
          />
          <TimeOffCard timeOff={(timeOffRows ?? []) as TimeOffRow[]} personId={id} canManage={canManage} />
          {showFinancials && <FinancialsCard person={row} />}
        </div>
      </div>
    </div>
  );
}
