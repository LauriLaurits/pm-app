import { consumptionSeverity, marginPct } from "@/lib/budget";
import { utilizationBadgeClasses, utilizationClass } from "@/lib/workload";
import { daysUntil, isApproachingDeadline, isStaleStatus } from "@/lib/dashboard";
import {
  deriveHealth,
  healthTitle,
  type DerivedHealth,
  type DerivedHealthLevel,
} from "@/lib/health";
import {
  type AttentionItem,
  type BudgetRow,
  type ExpiringCredential,
  type MilestoneLite,
  type ValidPerson,
  type ValidProject,
  type WorkloadPerson,
} from "./types";

const DEADLINE_DAYS = 14;
const STALE_DAYS = 14;
const ATTENTION_LIMIT = 8;
const DEADLINE_WINDOW_DAYS = 30;
const DEADLINE_TIMELINE_CAP = 8;
const MY_PROJECTS_CAP = 6;

// Health is DERIVED (lib/health.ts), same rule as the projects list/detail -- never the stored
// hand-typed column. The dashboard has no parts data, so the progress-lag signal is absent here;
// deadline + budget consumption still apply.
function rowHealth(p: ValidProject): DerivedHealth {
  return deriveHealth({
    status: p.status,
    startDate: p.start_date,
    deadline: p.deadline,
    consumptionPct:
      p.budget_total && p.budget_used !== null ? (p.budget_used / p.budget_total) * 100 : null,
    progressPct: null,
  });
}
// Projects with invoiced > paid (both nullable, treated as "no data" -- never coerced to 0 before
// comparing, or a project with neither would wrongly count as "0 > 0 == false", which happens to
// be correct by luck; the explicit null checks make that non-accidental). Shared by computeSummary's
// invoicesWaiting tile and computeFinanceOverview's outstanding figure so the two numbers can never
// drift apart. Not scoped to active-only -- money owed on a wrapped-up project still needs chasing.
function invoicesWaitingRows(budgetRows: BudgetRow[]) {
  return budgetRows.filter((r) => r.invoiced !== null && r.paid !== null && r.invoiced > r.paid);
}

function sumOutstanding(rows: BudgetRow[]): number {
  return rows.reduce((sum, r) => sum + ((r.invoiced ?? 0) - (r.paid ?? 0)), 0);
}

// ---- summary cards ----
// Reworked to the 5-tile action-first shape (Task 3 wires these into StatTiles): active projects,
// needs-attention counts, team utilization + availability, upcoming deadlines, invoices waiting.
// The old budgetRemaining/margin figures move to computeFinanceOverview below -- they're a
// Financial-card concern now, not a top-of-page KPI.
export function computeSummary(
  projects: ValidProject[],
  budgetRows: BudgetRow[],
  people: WorkloadPerson[]
) {
  const hasBudgetVisibility = budgetRows.some((r) => r.client_amount !== null);

  const activeProjects = projects.filter((p) => p.status === "active").length;
  const planningProjects = projects.filter((p) => p.status === "planning").length;
  const healthLevels = projects.map((p) => rowHealth(p).level);
  const criticalProjects = healthLevels.filter((l) => l === "critical").length;
  const warningProjects = healthLevels.filter((l) => l === "warning").length;
  const atRiskProjects = criticalProjects + warningProjects;
  const approachingDeadlines = projects.filter(
    (p) =>
      p.status !== "completed" &&
      p.status !== "archived" &&
      isApproachingDeadline(p.deadline, DEADLINE_DAYS)
  ).length;

  // Soonest still-open deadline (for the "next: X in Nd" subline), regardless of the 14-day window.
  const nextDeadline =
    projects
      .filter(
        (p): p is ValidProject & { deadline: string } =>
          p.status !== "completed" && p.status !== "archived" && !!p.deadline && daysUntil(p.deadline) >= 0
      )
      .map((p) => ({ name: p.name, days: daysUntil(p.deadline) }))
      .sort((a, b) => a.days - b.days)[0] ?? null;

  const teamUtilizationPct = people.length
    ? people.reduce((s, p) => s + (p.current_allocation_pct ?? 0), 0) / people.length
    : null;

  // Available = active, not on vacation right now, and under "full" utilization -- verbatim the
  // People directory's rule (src/app/(app)/people/page.tsx availableCount, ~lines 78-83).
  const peopleCount = people.length;
  const availableCount = people.filter((p) => {
    if (p.status !== "active" || p.on_vacation_now) return false;
    const cls = utilizationClass(p.current_allocation_pct ?? 0);
    return cls === "available" || cls === "partial";
  }).length;

  const waitingRows = invoicesWaitingRows(budgetRows);
  const invoicesWaiting = hasBudgetVisibility
    ? { count: waitingRows.length, outstanding: sumOutstanding(waitingRows) }
    : null;

  return {
    activeProjects,
    planningProjects,
    totalProjects: projects.length,
    atRiskProjects,
    criticalProjects,
    warningProjects,
    teamUtilizationPct,
    availableCount,
    peopleCount,
    approachingDeadlines,
    nextDeadline,
    invoicesWaiting,
    hasBudgetVisibility,
  };
}

// ---- overallocated people (used by unified attention feed) ----
export function computeOverallocatedPeople(people: ValidPerson[]): AttentionItem[] {
  return people
    .filter((p) => (p.current_allocation_pct ?? 0) > 100)
    .sort((a, b) => (b.current_allocation_pct ?? 0) - (a.current_allocation_pct ?? 0))
    .slice(0, ATTENTION_LIMIT)
    .map((p) => ({
      id: p.id,
      href: `/people/${p.id}`,
      primary: p.full_name,
      secondary: `${p.current_allocation_pct}% allocated`,
      badgeLabel: "Overallocated",
      badgeClassName: utilizationBadgeClasses(p.current_allocation_pct ?? 0),
    }));
}

// ---- unified attention feed (action-first redesign) ----
// Replaces the six computeXxx lists above on the new dashboard (Task 4 mounts it; the functions
// above stay for now so the current page keeps compiling until then). Every predicate below is
// copied verbatim from its computeXxx counterpart -- the SOURCES move into one feed, the RULES
// that decide what counts as "needs attention" do not change.

export type AttentionSeverity = "critical" | "warning" | "info";

export type FeedItem = {
  severity: AttentionSeverity;
  title: string;
  reason: string;
  kind: "project" | "budget" | "person" | "credential" | "status" | "pm";
  href: string;
};

const SEVERITY_RANK: Record<AttentionSeverity, number> = { critical: 0, warning: 1, info: 2 };

function pluralDays(n: number): string {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

export function buildAttentionFeed(input: {
  projects: ValidProject[];
  budgetRows: BudgetRow[];
  people: WorkloadPerson[];
  latestUpdateByProject: Record<string, string | null>;
  expiringCredentials: ExpiringCredential[];
}): FeedItem[] {
  const items: FeedItem[] = [];

  // Critical/warning projects -- verbatim computeNeedsAttention predicate (deriveHealth, skip
  // healthy). Health's own level IS the feed severity; reasons already read as the "why".
  for (const p of input.projects) {
    const health = rowHealth(p);
    if (health.level === "healthy") continue;
    items.push({
      severity: health.level,
      title: p.name,
      reason: healthTitle(health),
      kind: "project",
      href: `/projects/${p.id}`,
    });
  }

  // Over-budget projects -- verbatim computeOverBudget predicate. Grouped with critical projects:
  // consumptionSeverity "over" is the same >=100%-consumed threshold that makes a project's own
  // health critical, so it carries the same urgency here.
  for (const r of input.budgetRows) {
    if (r.client_amount === null || consumptionSeverity(r.consumption_pct) !== "over") continue;
    items.push({
      severity: "critical",
      title: r.name,
      reason: `over budget (${(r.consumption_pct ?? 0).toFixed(0)}%)`,
      kind: "budget",
      href: `/projects/${r.id}/budget`,
    });
  }

  // Overallocated people -- verbatim computeOverallocatedPeople predicate + secondary text
  // ("N% allocated"). Warning tier: a capacity caution, not a blown deadline/budget.
  for (const p of input.people) {
    if ((p.current_allocation_pct ?? 0) <= 100) continue;
    items.push({
      severity: "warning",
      title: p.full_name,
      reason: `${p.current_allocation_pct}% allocated`,
      kind: "person",
      href: `/people/${p.id}`,
    });
  }

  // Projects without a PM -- verbatim computeNoPm predicate (no status filter, same as today).
  for (const p of input.projects) {
    if (p.pm_name) continue;
    items.push({
      severity: "info",
      title: p.name,
      reason: "no PM assigned",
      kind: "pm",
      href: `/projects/${p.id}`,
    });
  }

  // Stale status -- verbatim computeStaleStatus predicate (active/planning/on_hold only, 14d).
  for (const p of input.projects) {
    if (p.status === "completed" || p.status === "archived") continue;
    const last = input.latestUpdateByProject[p.id] ?? null;
    if (!isStaleStatus(last, STALE_DAYS)) continue;
    items.push({
      severity: "info",
      title: p.name,
      reason: last ? `no update in ${pluralDays(-daysUntil(last.slice(0, 10)))}` : "no status update yet",
      kind: "status",
      href: `/projects/${p.id}`,
    });
  }

  // Expiring credentials -- horizon + limit already applied server-side by
  // fetchExpiringCredentials (30d, top 8); this just maps + phrases each one.
  for (const c of input.expiringCredentials) {
    const days = daysUntil(c.expires_at.slice(0, 10));
    items.push({
      severity: "info",
      title: c.name,
      reason: days < 0 ? `expired ${pluralDays(-days)} ago` : days === 0 ? "expires today" : `expires in ${pluralDays(days)}`,
      kind: "credential",
      href: `/projects/${c.project_id}/credentials`,
    });
  }

  // Stable sort: items keep their source's relative order within a tier, so the result is
  // deterministic for identical input without needing an arbitrary secondary sort key.
  return items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

// ---- My projects ----

export type MyProjectRow = {
  id: string;
  name: string;
  clientName: string | null;
  health: DerivedHealth;
  consumptionPct: number | null;
  progressPct: number | null;
  deadline: string | null;
};

const MY_PROJECT_HEALTH_RANK: Record<DerivedHealthLevel, number> = { critical: 0, warning: 1, healthy: 2 };

export function buildMyProjects(
  projects: ValidProject[],
  budgetRows: BudgetRow[],
  progressById: Record<string, number | null>,
  viewerPmId: string | null
): MyProjectRow[] {
  const budgetByProjectId = new Map(budgetRows.map((r) => [r.id, r]));
  const own = viewerPmId ? projects.filter((p) => p.pm_id === viewerPmId) : [];
  const candidates = own.length > 0 ? own : projects.filter((p) => p.status === "active");

  return candidates
    .map((p) => ({
      id: p.id,
      name: p.name,
      clientName: p.client_name,
      // Same rowHealth as every other list on this page (no parts/progress data folded into the
      // health signal) -- so a project's health dot reads identically here and in the attention
      // feed. progressPct below is carried separately, for the progress bar only.
      health: rowHealth(p),
      consumptionPct: budgetByProjectId.get(p.id)?.consumption_pct ?? null,
      progressPct: progressById[p.id] ?? null,
      deadline: p.deadline,
    }))
    .sort((a, b) => {
      const rank = MY_PROJECT_HEALTH_RANK[a.health.level] - MY_PROJECT_HEALTH_RANK[b.health.level];
      if (rank !== 0) return rank;
      const aDays = a.deadline ? daysUntil(a.deadline) : Number.POSITIVE_INFINITY;
      const bDays = b.deadline ? daysUntil(b.deadline) : Number.POSITIVE_INFINITY;
      return aDays - bDays;
    })
    .slice(0, MY_PROJECTS_CAP);
}

// ---- deadline timeline ----

export type DeadlineEntry = {
  date: string;
  label: string;
  projectId: string;
  projectName: string;
  kind: "deadline" | "milestone";
};

export function buildDeadlineTimeline(
  projects: ValidProject[],
  milestones: MilestoneLite[],
  todayISO: string
): DeadlineEntry[] {
  const from = new Date(`${todayISO}T00:00:00Z`);
  const inWindow = (dateISO: string) => daysUntil(dateISO, from) <= DEADLINE_WINDOW_DAYS;

  const entries: DeadlineEntry[] = [];

  for (const p of projects) {
    if (p.status === "completed" || p.status === "archived") continue;
    if (!p.deadline || !inWindow(p.deadline)) continue;
    entries.push({
      date: p.deadline,
      label: "Project deadline",
      projectId: p.id,
      projectName: p.name,
      kind: "deadline",
    });
  }

  const statusByProjectId = new Map(projects.map((p) => [p.id, p.status]));
  for (const m of milestones) {
    if (m.done) continue;
    const status = statusByProjectId.get(m.project_id);
    if (status === "completed" || status === "archived") continue;
    if (!inWindow(m.due_on)) continue;
    entries.push({
      date: m.due_on,
      label: m.name,
      projectId: m.project_id,
      projectName: m.projectName ?? "",
      kind: "milestone",
    });
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date)).slice(0, DEADLINE_TIMELINE_CAP);
}

// ---- financial overview ----

export type FinanceOverview = {
  invoicedThisMonth: number;
  outstanding: number;
  topConsumers: { id: string; name: string; pct: number }[];
  margin: { amount: number; pct: number } | null;
} | null;

const FINANCE_TOP_CONSUMERS = 3;

export function computeFinanceOverview(
  budgetRows: BudgetRow[],
  projects: ValidProject[],
  monthInvoiceTotal: number | null,
  hasBudget: boolean,
  hasFinance: boolean
): FinanceOverview {
  if (!hasBudget) return null;

  const statusById = new Map(projects.map((p) => [p.id, p.status]));
  const activeRows = budgetRows.filter((r) => r.client_amount !== null && statusById.get(r.id) === "active");

  const topConsumers = activeRows
    .filter((r) => r.consumption_pct !== null)
    .sort((a, b) => (b.consumption_pct ?? 0) - (a.consumption_pct ?? 0))
    .slice(0, FINANCE_TOP_CONSUMERS)
    .map((r) => ({ id: r.id, name: r.name, pct: r.consumption_pct ?? 0 }));

  // Same active-only margin rows/logic the old computeSummary used for its margin tile -- moved
  // here verbatim rather than re-derived, so the number doesn't drift from what it used to show.
  let margin: { amount: number; pct: number } | null = null;
  if (hasFinance) {
    const marginRows = activeRows.filter((r) => r.margin !== null);
    if (marginRows.length > 0) {
      const totalMargin = marginRows.reduce((s, r) => s + (r.margin ?? 0), 0);
      const totalClient = marginRows.reduce((s, r) => s + (r.client_amount ?? 0), 0);
      margin = { amount: totalMargin, pct: marginPct(totalMargin, totalClient) ?? 0 };
    }
  }

  return {
    invoicedThisMonth: monthInvoiceTotal ?? 0,
    outstanding: sumOutstanding(invoicesWaitingRows(budgetRows)),
    topConsumers,
    margin,
  };
}
