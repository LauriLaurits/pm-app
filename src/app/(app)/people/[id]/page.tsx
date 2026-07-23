import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import type { PersonListRow, PersonWorkloadRow } from "../types";
import { PersonFormDialog } from "../person-form-dialog";
import { CurrentProjectsCard } from "./current-projects-card";
import { FinancialsCard } from "./financials-card";
import { resolveLogTimeData } from "./log-time-data";
import { LogTimeDialog } from "./log-time-dialog";
import { PersonHeader } from "./person-header";
import { PersonSummaryStrip } from "./person-summary-strip";
import { RecentActivityCard } from "./recent-activity-card";
import { TimeOffCard } from "./time-off-card";
import type {
  ActivityItem,
  AssignedProjectOption,
  AssignmentWithProject,
  CurrentProjectItem,
  PartOption,
  ProjectStatus,
  TimeOffRow,
} from "./types";

type ProjectJoinRow = {
  id: string;
  name: string;
  status: ProjectStatus;
  start_date: string | null;
  deadline: string | null;
  pm_id: string | null;
};

type MemberPeriodRow = {
  project_id: string;
  role_on_project: string | null;
  starts_on: string | null;
  ends_on: string | null;
};

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

  const viewer = await getCurrentUser();

  // "view assignments" / "read own time" / "view time_off" RLS already scopes each of these to
  // whatever the caller may see -- this page does not widen any of that. current_person_id()
  // also tells us if the VIEWER is on their OWN page -- the log-time form/delete controls are
  // only ever wired in for that case (everyone else gets a read-only list). The manage_people
  // check rides the same parallel wave (perf: it used to be its own round trip) -- UX gating
  // only, the real security boundary is requirePermission("manage_people") inside
  // upsertTimeOffAction/deleteTimeOffAction, which re-checks has_permission server-side
  // regardless of what's rendered here. Same pattern as the People list page's canManage.
  // The `people` read only fetches the person's linked user_id (needed to resolve their
  // project_members rows and audit trail) -- same view_people RLS as the row above.
  const [
    { data: assignmentRows },
    { data: timeOffRows },
    { data: myPersonId },
    { data: canManagePeople },
    { data: personLink },
    { data: managedOptions },
  ] = await Promise.all([
    supabase
      .from("assignments")
      .select("*")
      .eq("person_id", id)
      .order("start_date", { ascending: false }),
    supabase
      .from("time_off")
      .select("*")
      .eq("person_id", id)
      .order("starts_on", { ascending: false }),
    supabase.rpc("current_person_id"),
    viewer
      ? supabase.rpc("has_permission", { uid: viewer.user.id, perm: "manage_people" })
      : Promise.resolve({ data: false }),
    supabase.from("people").select("user_id, email").eq("id", id).maybeSingle(),
    supabase.from("managed_options").select("kind, value").order("sort").order("value"),
  ]);
  const isOwnPage = myPersonId === id;
  const canManage = !!canManagePeople;
  const linkedUserId = personLink?.user_id ?? null;
  const roleTitleOptions = (managedOptions ?? [])
    .filter((option) => option.kind === "role_title")
    .map((option) => option.value);
  const teamOptions = (managedOptions ?? [])
    .filter((option) => option.kind === "team")
    .map((option) => option.value);
  const editablePerson: PersonListRow = {
    ...row,
    id,
    email: personLink?.email ?? null,
  };

  // Project fields resolved via a separate `projects` query (RLS: "view project", scoped by
  // has_permission(..., 'view_project', id)) rather than a nested select on assignments/
  // assignments -- same precedent as pm/owner names on the Project Overview tab and member
  // names on the Project People tab: a caller who can see the assignment row but lacks
  // view_project on that specific project gets missing fields here rather than a join error.
  // project_members (the person's role/periods per project) and audit_logs (view_audit-gated:
  // non-holders silently get zero rows and the Recent activity card never renders) only depend
  // on wave-1 results, so they ride the same round trip.
  const projectIds = [...new Set((assignmentRows ?? []).map((a) => a.project_id))];
  const auditFilter = [
    `resource_id.eq.${id}`,
    `metadata->>person_id.eq.${id}`,
    ...(linkedUserId ? [`actor_id.eq.${linkedUserId}`, `metadata->>user_id.eq.${linkedUserId}`] : []),
  ].join(",");
  const [{ data: projectRows }, { data: memberRows }, { data: auditRows }] = await Promise.all([
    projectIds.length
      ? supabase
          .from("projects")
          .select("id, name, status, start_date, deadline, pm_id")
          .in("id", projectIds)
      : Promise.resolve({ data: [] as ProjectJoinRow[] }),
    linkedUserId && projectIds.length
      ? supabase
          .from("project_members")
          .select("project_id, role_on_project, starts_on, ends_on")
          .eq("user_id", linkedUserId)
          .in("project_id", projectIds)
      : Promise.resolve({ data: [] as MemberPeriodRow[] }),
    supabase
      .from("audit_logs")
      .select("id, action, created_at")
      .or(auditFilter)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  const projectById = new Map((projectRows ?? []).map((p) => [p.id, p as ProjectJoinRow]));
  const projectNameById = new Map((projectRows ?? []).map((p) => [p.id, p.name]));

  const assignments: AssignmentWithProject[] = (assignmentRows ?? []).map((a) => ({
    ...a,
    project_name: projectNameById.get(a.project_id) ?? null,
  }));
  const today = new Date().toISOString().slice(0, 10);
  const current = assignments.filter(
    (a) => a.start_date <= today && (!a.end_date || a.end_date >= today)
  );
  const upcoming = assignments.filter((a) => a.start_date > today);
  const past = assignments.filter((a) => a.end_date && a.end_date < today);

  // PM names resolve through `people` (view_people, granted globally) rather than a
  // user_profiles join -- same precedent as the Project Overview tab. Depends on the projects
  // read above, so it can't join that wave.
  const pmIds = [
    ...new Set(
      current
        .map((a) => projectById.get(a.project_id)?.pm_id)
        .filter((v): v is string => !!v)
    ),
  ];
  const { data: pmRows } = pmIds.length
    ? await supabase.from("people").select("user_id, full_name").in("user_id", pmIds)
    : { data: [] as { user_id: string | null; full_name: string }[] };
  const pmNameByUserId = new Map((pmRows ?? []).map((p) => [p.user_id, p.full_name]));

  const membershipsByProject = new Map<string, MemberPeriodRow[]>();
  for (const m of (memberRows ?? []) as MemberPeriodRow[]) {
    const list = membershipsByProject.get(m.project_id) ?? [];
    list.push(m);
    membershipsByProject.set(m.project_id, list);
  }

  const capacity = row.weekly_capacity_hours ?? 0;
  const currentProjects: CurrentProjectItem[] = current.map((a) => {
    const project = projectById.get(a.project_id);
    const memberships = membershipsByProject.get(a.project_id) ?? [];
    return {
      assignmentId: a.id,
      projectId: a.project_id,
      projectName: project?.name ?? null,
      projectStatus: project?.status ?? null,
      projectStart: project?.start_date ?? null,
      projectDeadline: project?.deadline ?? null,
      pmName: project?.pm_id ? (pmNameByUserId.get(project.pm_id) ?? null) : null,
      // The person's role on the project: the membership row is authoritative when visible,
      // the assignment's own role_on_project is the fallback.
      roleOnProject:
        memberships.find((m) => m.role_on_project)?.role_on_project ?? a.role_on_project,
      allocationPct: a.allocation_pct,
      allocatedHours:
        capacity > 0 ? Math.round((a.allocation_pct / 100) * capacity * 10) / 10 : null,
      membershipPeriods: memberships.map((m) => ({ starts_on: m.starts_on, ends_on: m.ends_on })),
    };
  });

  // Next relevant absence for the summary strip: ends_on >= today includes one in progress --
  // an assigning PM cares that the person is away NOW, not only about entries that haven't
  // started yet. (Rows arrive newest-first, so re-sort ascending and take the earliest.)
  const nextTimeOff =
    (timeOffRows ?? [])
      .filter((t) => t.ends_on >= today)
      .sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0] ?? null;

  // Log-time picker data (own page only) -- projects the viewer is a member of OR assigned to,
  // matching the widened "log own time" RLS policy (see log-time-data.ts).
  const { assignedProjects, partsByProject } = isOwnPage && viewer
    ? await resolveLogTimeData(supabase, viewer.user.id, assignments, projectNameById)
    : { assignedProjects: [] as AssignedProjectOption[], partsByProject: {} as Record<string, PartOption[]> };

  // Finance gating lives entirely in `person_workload_rows` (security_invoker view whose LEFT
  // JOIN onto `rates` is nulled by RLS for non-finance callers) -- this page never reads
  // `rates` directly. Non-null here means the caller already has view_internal_cost.
  const showFinancials = row.internal_cost !== null || row.billing_rate !== null;

  const activityItems = (auditRows ?? []) as ActivityItem[];

  return (
    <div className="space-y-4">
      <PersonHeader
        person={row}
        action={
          <div className="flex items-center gap-2">
            {isOwnPage && (
              <LogTimeDialog projects={assignedProjects} partsByProject={partsByProject} />
            )}
            {canManage && (
              <PersonFormDialog
                person={editablePerson}
                roleTitleOptions={roleTitleOptions}
                teamOptions={teamOptions}
              />
            )}
          </div>
        }
      />
      <PersonSummaryStrip
        allocationPct={row.current_allocation_pct ?? 0}
        capacityHours={capacity}
        activeProjectCount={row.active_project_count ?? 0}
        activeProjectNames={currentProjects
          .map((p) => p.projectName)
          .filter((n): n is string => !!n)}
        nextTimeOff={nextTimeOff as TimeOffRow | null}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <CurrentProjectsCard current={currentProjects} upcoming={upcoming} past={past} />
        </div>
        <div className="space-y-4">
          <TimeOffCard
            timeOff={(timeOffRows ?? []) as TimeOffRow[]}
            personId={id}
            today={today}
            canManage={canManage}
          />
          {showFinancials && <FinancialsCard person={row} />}
          {activityItems.length > 0 && <RecentActivityCard items={activityItems} />}
        </div>
      </div>
    </div>
  );
}
