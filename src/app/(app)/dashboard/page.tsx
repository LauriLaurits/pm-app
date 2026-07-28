import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { SummaryCards } from "./summary-cards";
import { AttentionSections } from "./attention-sections";
import { DashboardHeader, type CreateProjectProps, type LogTimeProps } from "./dashboard-header";
import {
  buildAttentionFeed,
  computeNeedsAttention,
  computeNoPm,
  computeOverBudget,
  computeOverallocatedPeople,
  computeStaleStatus,
  computeSummary,
} from "./compute";
import { fetchDashboardBase, fetchExpiringCredentials, fetchLatestStatusUpdateByProject } from "./queries";
import { formatDate, type AttentionItem, type ProjectBudgetRow, type ProjectListRow } from "./types";
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
    canCreateRes,
    createClientsRes,
    createContactsRes,
    createPmsRes,
    personRowRes,
  ] = await Promise.all([
    fetchDashboardBase(supabase),
    fetchLatestStatusUpdateByProject(supabase),
    fetchExpiringCredentials(supabase),
    current
      ? supabase.rpc("has_permission", { uid: current.user.id, perm: "create_project" })
      : Promise.resolve({ data: false }),
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("client_contacts").select("id, client_id, name, email").order("name"),
    current ? supabase.rpc("pm_options") : Promise.resolve({ data: [] as PmOption[] }),
    current
      ? supabase.from("people").select("id").eq("user_id", current.user.id).maybeSingle()
      : Promise.resolve({ data: null as { id: string } | null }),
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

  // Unified attention feed (Task 2) -- only its length/severity breakdown is consumed here, for
  // the KPI tile; the feed itself renders below the fold starting Task 4 (AttentionSections stays
  // the visible list until then).
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

  const expiringCredItems: AttentionItem[] = expiringCreds.map((c) => ({
    id: c.id,
    href: `/projects/${c.project_id}/credentials`,
    primary: c.name,
    secondary: `${c.projectName ? `${c.projectName} — ` : ""}expires ${formatDate(c.expires_at)}`,
  }));

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
            overallocatedCount={computeOverallocatedPeople(people).length}
            approachingDeadlines={summary.approachingDeadlines}
            nextDeadline={summary.nextDeadline}
            invoicesWaiting={summary.invoicesWaiting}
          />

          {/* Transitional: Task 4 replaces this block with the unified attentionFeed (computed
              above) rendered under a #needs-attention anchor. Kept rendering the OLD per-list
              sections here so the page stays shippable until then. */}
          <AttentionSections
            needsAttention={computeNeedsAttention(projects)}
            expiringCredentials={expiringCredItems}
            overBudget={computeOverBudget(budgetRows, summary.hasBudgetVisibility)}
            overallocatedPeople={computeOverallocatedPeople(people)}
            noPm={computeNoPm(projects)}
            staleStatus={computeStaleStatus(projects, latestStatusByProject)}
          />
        </>
      )}
    </div>
  );
}
