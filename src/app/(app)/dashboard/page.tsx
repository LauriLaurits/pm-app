import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { deriveProgress, type ProgressPart } from "@/lib/progress";
import { deriveHealth } from "@/lib/health";
import { SummaryCards } from "./summary-cards";
import { AttentionFeed } from "./attention-feed";
import { MyProjectsCard } from "./my-projects-card";
import { TeamCard } from "./team-card";
import { DeadlinesCard } from "./deadlines-card";
import { ActivityCard, type ActivityData } from "./activity-card";
import { FinanceCard } from "./finance-card";
import { HealthStrip } from "./health-strip";
import { DashboardHeader, type CreateProjectProps, type LogTimeProps } from "./dashboard-header";
import {
  buildAttentionFeed,
  buildDeadlineTimeline,
  buildMyProjects,
  computeFinanceOverview,
  computeSummary,
} from "./compute";
import {
  fetchDashboardBase,
  fetchExpiringCredentials,
  fetchLatestStatusUpdateByProject,
  fetchMilestonesUpcoming,
  fetchMonthInvoiceTotal,
  fetchRecentAudit,
  fetchRecentStatusUpdates,
} from "./queries";
import type { ProjectBudgetRow, ProjectListRow, ValidProject } from "./types";
import { resolveLogTimeData } from "../people/[id]/log-time-data";
import type { AssignmentWithProject } from "../people/[id]/types";
import type { ClientContactOption, ClientOption, PmOption } from "../projects/new/project-create-fields";

function firstWord(value: string): string {
  return value.trim().split(/\s+/)[0] || value;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  // UX gating only, mirrors projects/page.tsx -- the real boundaries are createProjectAction's
  // requirePermission('create_project') and the "log own time" RLS policy, both re-checked
  // server-side regardless of what renders here.
  const current = await getCurrentUser();

  // Pure, no-DB date math shared by the deadline timeline (fetchMilestonesUpcoming's horizon) and
  // the finance card (fetchMonthInvoiceTotal's month boundary) -- computed once up front so both
  // wave entries below use the exact same "today".
  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const monthStartISO = `${todayISO.slice(0, 7)}-01`;

  // One parallel wave for everything that doesn't depend on another read. New-project dialog
  // data (canCreate/clients/contacts/pm_options) rides here per the plan -- see
  // ProjectCreateDialog's option-fetch block in projects/page.tsx for precedent. The viewer's own
  // `people` row (for the Log time button) also has no dependency on anything else, so it joins
  // this wave too; only the assignments read that depends on its id needs a second wave below.
  // Kept as a flat array (not nested projects-table reads) so a Task 4 `projects` pm_id read can
  // be added alongside these without restructuring the wave.
  const [
    base,
    latestStatusByProject,
    expiringCreds,
    milestones,
    monthInvoiceTotal,
    canCreateRes,
    viewAuditRes,
    createClientsRes,
    createContactsRes,
    createPmsRes,
    personRowRes,
    pmIdsRes,
    partsRes,
  ] = await Promise.all([
    fetchDashboardBase(supabase),
    fetchLatestStatusUpdateByProject(supabase),
    fetchExpiringCredentials(supabase),
    // Deadlines card (Task 5) -- undone milestones due within the same 30-day window
    // buildDeadlineTimeline windows project deadlines against.
    fetchMilestonesUpcoming(supabase, todayISO),
    // Finance card (Task 5) -- portfolio-wide invoiced total for the current month. Safe to call
    // unconditionally (gated by view_budget alone, same as project_budget_rows' own RLS); the card
    // itself stays hidden whenever computeFinanceOverview returns null for this viewer.
    fetchMonthInvoiceTotal(supabase, monthStartISO),
    current
      ? supabase.rpc("has_permission", { uid: current.user.id, perm: "create_project" })
      : Promise.resolve({ data: false }),
    // Activity card (Task 5) -- gates which feed page.tsx reads below (audit rows vs. the
    // status-update fallback), mirrored in the wave next to the other has_permission check above.
    current
      ? supabase.rpc("has_permission", { uid: current.user.id, perm: "view_audit" })
      : Promise.resolve({ data: false }),
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("client_contacts").select("id, client_id, name, email").order("name"),
    current ? supabase.rpc("pm_options") : Promise.resolve({ data: [] as PmOption[] }),
    current
      ? supabase.from("people").select("id").eq("user_id", current.user.id).maybeSingle()
      : Promise.resolve({ data: null as { id: string } | null }),
    // project_list_rows (base.projects) has no pm_id column -- My projects (Task 4) needs the real
    // pm_id to test "is this the viewer's own project", so it's merged in from a lightweight
    // second read, same two-step idiom projects/page.tsx already uses for editable-ids checks.
    supabase.from("projects").select("id, pm_id"),
    // Parts for every visible project -- small table at this scale, cheaper to read once here
    // than to first resolve My-projects' candidate ids and read only those (Task 4 carried note).
    supabase.from("project_parts").select("project_id, status, estimated_hours"),
  ]);

  const hasError = Boolean(base.projectsError || base.budgetError || base.workloadError);

  // Every *_rows view marks every column nullable in the generated types (typical for Postgres
  // views), but `id`/`name` are the underlying tables' NOT NULL columns and are never actually
  // null -- filter defensively once here so every downstream compute() helper can rely on plain
  // `string`, same pattern as the Workload timeline (src/app/(app)/workload/page.tsx).
  const projects = base.projects.filter(
    (p): p is ProjectListRow & { id: string; name: string } => p.id !== null && p.name !== null
  );
  const budgetRows = base.budgetRows.filter(
    (r): r is ProjectBudgetRow & { id: string; name: string } => r.id !== null && r.name !== null
  );
  const people = base.workloadRows.filter(
    (p): p is (typeof base.workloadRows)[number] & { id: string; full_name: string } =>
      p.id !== null && p.full_name !== null
  );

  const summary = computeSummary(projects, budgetRows, people);

  // Health strip counts -- projects that are not completed/archived, grouped by health level.
  // Uses the same deriveHealth logic as projects/page.tsx, but without parts-derived progress
  // (dashboard has no parts data). Same two-step pattern: derive health for each project, then
  // count by level.
  const activeProjects = projects.filter(
    (p) => p.status !== "completed" && p.status !== "archived"
  );
  const healthLevelById = new Map(
    activeProjects.map((p) => [
      p.id,
      deriveHealth({
        status: p.status,
        startDate: p.start_date,
        deadline: p.deadline,
        consumptionPct:
          p.budget_total && p.budget_used !== null ? (p.budget_used / p.budget_total) * 100 : null,
        progressPct: null,
      }).level,
    ])
  );
  const healthyCount = activeProjects.filter((p) => healthLevelById.get(p.id) === "healthy").length;
  const warningCount = activeProjects.filter((p) => healthLevelById.get(p.id) === "warning").length;
  const criticalCount = activeProjects.filter((p) => healthLevelById.get(p.id) === "critical").length;

  // Unified attention feed (Task 2) -- drives both the KPI tile's count/severity breakdown and
  // the AttentionFeed card rendered below, so the two numbers can never disagree.
  const latestUpdateByProject: Record<string, string | null> = Object.fromEntries(latestStatusByProject);
  const attentionFeed = buildAttentionFeed({
    projects,
    budgetRows,
    people,
    latestUpdateByProject,
    expiringCredentials: expiringCreds,
  });
  const needsAttentionCritical = attentionFeed.filter((i) => i.severity === "critical").length;
  const needsAttentionWarning = attentionFeed.filter((i) => i.severity === "warning").length;

  // My projects (Task 4) -- pm_id merged in from the lightweight `projects` read above (see the
  // wave comment); progress per project derived from `project_parts` the same way the projects
  // list does (src/app/(app)/projects/page.tsx). Own-PM rows are pre-filtered to non-completed/
  // -archived before buildMyProjects sees them: buildMyProjects itself doesn't apply that filter
  // to a viewer's own projects (only to the no-PM-projects "all active" fallback branch), so a
  // wrapped-up project a PM owns would otherwise still show here looking like open work.
  const pmIdByProjectId = new Map((pmIdsRes.data ?? []).map((p) => [p.id, p.pm_id]));
  const partsByProjectId = new Map<string, ProgressPart[]>();
  for (const part of partsRes.data ?? []) {
    const list = partsByProjectId.get(part.project_id) ?? [];
    list.push({ status: part.status, estimated_hours: part.estimated_hours });
    partsByProjectId.set(part.project_id, list);
  }
  const progressById: Record<string, number | null> = {};
  for (const p of projects) {
    progressById[p.id] = deriveProgress(partsByProjectId.get(p.id) ?? []).pct;
  }
  const myProjectsCandidates: ValidProject[] = projects
    .map((p) => ({ ...p, pm_id: pmIdByProjectId.get(p.id) ?? null }))
    .filter((p) => p.status !== "completed" && p.status !== "archived");
  const myProjects = buildMyProjects(myProjectsCandidates, budgetRows, progressById, current?.user.id ?? null);

  // Deadlines timeline (Task 5) -- overdue + next-30-days project deadlines and undone milestones,
  // merged/sorted/capped by buildDeadlineTimeline itself.
  const deadlines = buildDeadlineTimeline(projects, milestones, todayISO);

  // Financial overview (Task 5) -- null (card hidden entirely) unless the viewer has budget
  // visibility; margin is further gated on internal-cost visibility, same one-liner
  // reports/page.tsx uses for its own hasFinanceVisibility.
  const hasFinanceVisibility = budgetRows.some((r) => r.internal_cost !== null);
  const financeOverview = computeFinanceOverview(
    budgetRows,
    projects,
    monthInvoiceTotal,
    summary.hasBudgetVisibility,
    hasFinanceVisibility
  );

  // Recent activity (Task 5) -- audit_logs rows for view_audit holders, or a status-update
  // fallback for everyone else. The permission check itself already happened in the wave above
  // (viewAuditRes); this is the conditional "second await" for whichever feed it unlocked, same
  // idiom the old dashboard used for its conditionally-awaited finance data.
  const canViewAudit = Boolean(viewAuditRes.data);
  const activityData: ActivityData = canViewAudit
    ? { kind: "audit", rows: await fetchRecentAudit(supabase) }
    : { kind: "status", rows: await fetchRecentStatusUpdates(supabase) };

  // New-project dialog data -- gated on create_project (UX only). PM options mirror
  // projects/page.tsx: the viewer is unshifted onto pm_options() if missing (a brand-new PM with
  // zero assigned projects yet), and avatars are backfilled from project_list_rows -- reusing
  // `base.projects` (already fetched above) instead of a second identical query.
  const canCreate = Boolean(canCreateRes.data);
  const createPms: PmOption[] = createPmsRes.data ?? [];
  if (current && !createPms.some((pm) => pm.user_id === current.user.id)) {
    createPms.unshift({
      user_id: current.user.id,
      full_name: current.profile.full_name ?? current.profile.email,
    });
  }
  const pmAvatarByName = new Map<string, string | null>();
  for (const p of base.projects) {
    if (p.pm_name && !pmAvatarByName.has(p.pm_name)) pmAvatarByName.set(p.pm_name, p.pm_avatar_url);
  }
  for (const pm of createPms) {
    pm.avatar_url ??= pmAvatarByName.get(pm.full_name) ?? null;
  }
  const createProps: CreateProjectProps | null = current
    ? {
        clients: (createClientsRes.data ?? []) as ClientOption[],
        contacts: (createContactsRes.data ?? []) as ClientContactOption[],
        pms: createPms,
        currentUserId: current.user.id,
      }
    : null;

  // Log-time picker data -- the viewer's own `people` row (fetched above) plus their own
  // assignments ("read own time"/assignments RLS always shows own rows regardless of role).
  // Mirrors people/[id]/page.tsx's own-page branch. Hidden entirely (not a disabled button) when
  // the viewer has no person row, or resolveLogTimeData finds nothing loggable.
  const personId = personRowRes.data?.id ?? null;
  let logTimeProps: LogTimeProps | null = null;
  if (current && personId) {
    const { data: ownAssignmentRows } = await supabase
      .from("assignments")
      .select("*")
      .eq("person_id", personId);
    const projectNameById = new Map(projects.map((p) => [p.id, p.name]));
    const assignments: AssignmentWithProject[] = (ownAssignmentRows ?? []).map((a) => ({
      ...a,
      project_name: projectNameById.get(a.project_id) ?? null,
    }));
    const { assignedProjects, partsByProject } = await resolveLogTimeData(
      supabase,
      current.user.id,
      assignments,
      projectNameById
    );
    if (assignedProjects.length > 0) {
      logTimeProps = { projects: assignedProjects, partsByProject };
    }
  }

  const displayName = firstWord(current?.profile.full_name || current?.profile.email || "there");

  return (
    <div className="space-y-4">
      <DashboardHeader
        name={displayName}
        canCreate={canCreate}
        createProps={createProps}
        logTimeProps={logTimeProps}
      />

      {hasError ? (
        <p className="text-destructive">Failed to load the dashboard. Try again.</p>
      ) : (
        <>
          <SummaryCards
            activeProjects={summary.activeProjects}
            planningProjects={summary.planningProjects}
            totalProjects={summary.totalProjects}
            needsAttentionCount={attentionFeed.length}
            needsAttentionCritical={needsAttentionCritical}
            needsAttentionWarning={needsAttentionWarning}
            teamUtilizationPct={summary.teamUtilizationPct}
            availableCount={summary.availableCount}
            peopleCount={summary.peopleCount}
            approachingDeadlines={summary.approachingDeadlines}
            nextDeadline={summary.nextDeadline}
            invoicesWaiting={summary.invoicesWaiting}
          />

          {/* Unified attention feed + My projects + Team, replacing the old six-list grid.
              Feed first (widest signal), same #needs-attention anchor the KPI tile links to. */}
          <div className="grid gap-4 xl:grid-cols-3">
            <AttentionFeed items={attentionFeed} />
            <MyProjectsCard rows={myProjects} hasBudget={summary.hasBudgetVisibility} />
            <TeamCard people={people} />
          </div>

          {/* Deadlines + Activity + Finance (Task 5). FinanceCard is omitted entirely (not an
              empty placeholder) for viewers without budget visibility -- the grid just flows the
              remaining two cards into the first two columns rather than leaving a boxed hole. */}
          <div className="grid gap-4 xl:grid-cols-3">
            <DeadlinesCard entries={deadlines} />
            <ActivityCard data={activityData} />
            {financeOverview && <FinanceCard overview={financeOverview} />}
          </div>

          {/* Health strip (Task 6) -- portfolio health at a glance. Three segments link to the
              projects list filtered by health level. */}
          <HealthStrip
            healthy={healthyCount}
            warning={warningCount}
            critical={criticalCount}
          />
        </>
      )}
    </div>
  );
}
