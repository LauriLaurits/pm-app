import { consumptionBadgeClasses, consumptionSeverity, formatMoney, marginPct } from "@/lib/budget";
import { utilizationBadgeClasses } from "@/lib/workload";
import { isApproachingDeadline, isStaleStatus } from "@/lib/dashboard";
import { HEALTH_BADGE_CLASS } from "../projects/types";
import type { BudgetSpentRow } from "@/components/charts/budget-spent-chart";
import type { CapacityRow } from "@/components/charts/capacity-chart";
import type { ProjectStatusCount } from "@/components/charts/project-status-chart";
import type { PlannedActualRow } from "@/components/charts/planned-actual-hours-chart";
import type { FinanceSummary } from "./summary-cards";
import { formatDate, humanize, type AttentionItem, type ProjectBudgetRow, type ProjectListRow } from "./types";

const DEADLINE_DAYS = 14;
const STALE_DAYS = 14;
const ATTENTION_LIMIT = 8;
const CHART_TOP_N = 6;
const CAPACITY_TOP_N = 8;
const STATUS_ORDER = ["planning", "active", "on_hold", "completed", "archived"] as const;

type ValidProject = ProjectListRow & { id: string; name: string };
type ValidBudgetRow = ProjectBudgetRow & { id: string; name: string };
type ValidPerson = {
  id: string;
  full_name: string;
  current_allocation_pct: number | null;
  weekly_capacity_hours: number | null;
};

// ---- summary cards ----
export function computeSummary(
  projects: ValidProject[],
  budgetRows: ValidBudgetRow[],
  people: ValidPerson[]
) {
  const statusById = new Map(projects.map((p) => [p.id, p.status]));
  const hasBudgetVisibility = budgetRows.some((r) => r.client_amount !== null);
  const activeBudgetRows = budgetRows.filter(
    (r) => r.client_amount !== null && statusById.get(r.id) === "active"
  );
  const totalActiveBudget = hasBudgetVisibility
    ? activeBudgetRows.reduce((sum, r) => sum + (r.client_amount ?? 0), 0)
    : null;
  const budgetRemaining = hasBudgetVisibility
    ? activeBudgetRows.reduce((sum, r) => sum + (r.remaining ?? 0), 0)
    : null;

  const costRows = budgetRows.filter((r) => r.internal_cost !== null);
  const hasFinanceVisibility = costRows.length > 0;
  const totalInternalCost = hasFinanceVisibility
    ? costRows.reduce((sum, r) => sum + (r.internal_cost ?? 0), 0)
    : null;
  const marginRows = budgetRows.filter((r) => r.margin !== null && r.client_amount !== null);
  const totalMargin = marginRows.length ? marginRows.reduce((s, r) => s + (r.margin ?? 0), 0) : null;
  const totalClientForMargin = marginRows.length
    ? marginRows.reduce((s, r) => s + (r.client_amount ?? 0), 0)
    : null;
  const finance: FinanceSummary | null = hasFinanceVisibility
    ? { totalInternalCost, totalMargin, blendedMarginPct: marginPct(totalMargin, totalClientForMargin) }
    : null;

  const activeProjects = projects.filter((p) => p.status === "active").length;
  const atRiskProjects = projects.filter((p) => p.health === "warning" || p.health === "critical").length;
  const approachingDeadlines = projects.filter(
    (p) =>
      p.status !== "completed" &&
      p.status !== "archived" &&
      isApproachingDeadline(p.deadline, DEADLINE_DAYS)
  ).length;
  const overallocatedCount = people.filter((p) => (p.current_allocation_pct ?? 0) > 100).length;
  const teamUtilizationPct = people.length
    ? people.reduce((s, p) => s + (p.current_allocation_pct ?? 0), 0) / people.length
    : null;

  return {
    activeProjects,
    atRiskProjects,
    totalActiveBudget,
    budgetRemaining,
    teamUtilizationPct,
    overallocatedCount,
    approachingDeadlines,
    finance,
    hasBudgetVisibility,
  };
}

// ---- charts ----
export function computeBudgetSpentChart(budgetRows: ValidBudgetRow[], hasBudgetVisibility: boolean) {
  if (!hasBudgetVisibility) return null;
  return budgetRows
    .filter((r) => r.client_amount !== null)
    .sort((a, b) => (b.client_amount ?? 0) - (a.client_amount ?? 0))
    .slice(0, CHART_TOP_N)
    .map((r): BudgetSpentRow => ({ id: r.id, name: r.name, invoiced: r.invoiced ?? 0, remaining: Math.max(r.remaining ?? 0, 0) }));
}

export function computeCapacityChart(people: ValidPerson[]): CapacityRow[] {
  return people
    .sort((a, b) => (b.current_allocation_pct ?? 0) - (a.current_allocation_pct ?? 0))
    .slice(0, CAPACITY_TOP_N)
    .map((p) => {
      const capacityHours = Number(p.weekly_capacity_hours ?? 0);
      const allocatedHours = Math.round(((p.current_allocation_pct ?? 0) / 100) * capacityHours * 10) / 10;
      return { id: p.id, name: p.full_name, capacityHours, allocatedHours };
    });
}

export function computeStatusChart(projects: ValidProject[]): ProjectStatusCount[] {
  return STATUS_ORDER.map((status) => ({
    status,
    label: humanize(status),
    count: projects.filter((p) => p.status === status).length,
  }));
}

export function computePlannedActualChart(
  projects: ValidProject[],
  estimatedByProject: Map<string, number>,
  actualByProject: Map<string, number>
): PlannedActualRow[] {
  return projects
    .filter((p) => (estimatedByProject.get(p.id) ?? 0) > 0 || (actualByProject.get(p.id) ?? 0) > 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      planned: Math.round((estimatedByProject.get(p.id) ?? 0) * 10) / 10,
      actual: Math.round((actualByProject.get(p.id) ?? 0) * 10) / 10,
    }))
    .sort((a, b) => b.planned - a.planned)
    .slice(0, CHART_TOP_N);
}

// ---- attention sections ----
export function computeRecentlyUpdated(projects: ValidProject[]): AttentionItem[] {
  return [...projects]
    .sort((a, b) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime())
    .slice(0, ATTENTION_LIMIT)
    .map((p) => ({
      id: p.id,
      href: `/projects/${p.id}`,
      primary: p.name,
      secondary: `Updated ${formatDate(p.updated_at)}`,
    }));
}

export function computeNeedsAttention(projects: ValidProject[]): AttentionItem[] {
  return projects
    .filter((p) => p.health === "warning" || p.health === "critical")
    .slice(0, ATTENTION_LIMIT)
    .map((p) => ({
      id: p.id,
      href: `/projects/${p.id}`,
      primary: p.name,
      secondary: p.client_name ?? undefined,
      badgeLabel: humanize(p.health ?? ""),
      // HEALTH_BADGE_CLASS.critical is deliberately "" upstream (projects/types.ts pairs it with
      // variant="destructive" instead) -- this list always uses variant="outline", so critical
      // needs its own explicit color here, matching the same red-500 tier used by
      // consumptionBadgeClasses/utilizationBadgeClasses elsewhere.
      badgeClassName:
        p.health === "critical"
          ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
          : HEALTH_BADGE_CLASS[p.health ?? "healthy"],
    }));
}

export function computeOverBudget(
  budgetRows: ValidBudgetRow[],
  hasBudgetVisibility: boolean
): AttentionItem[] | null {
  if (!hasBudgetVisibility) return null;
  return budgetRows
    .filter((r) => r.client_amount !== null && consumptionSeverity(r.consumption_pct) === "over")
    .sort((a, b) => (b.consumption_pct ?? 0) - (a.consumption_pct ?? 0))
    .slice(0, ATTENTION_LIMIT)
    .map((r) => ({
      id: r.id,
      href: `/projects/${r.id}/budget`,
      primary: r.name,
      secondary: `${formatMoney(r.invoiced)} invoiced of ${formatMoney(r.client_amount)}`,
      badgeLabel: `${(r.consumption_pct ?? 0).toFixed(0)}%`,
      badgeClassName: consumptionBadgeClasses(r.consumption_pct),
    }));
}

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

export function computeNoPm(projects: ValidProject[]): AttentionItem[] {
  return projects
    .filter((p) => !p.pm_name)
    .slice(0, ATTENTION_LIMIT)
    .map((p) => ({ id: p.id, href: `/projects/${p.id}`, primary: p.name, secondary: p.client_name ?? undefined }));
}

export function computeStaleStatus(
  projects: ValidProject[],
  latestByProject: Map<string, string>
): AttentionItem[] {
  return projects
    .filter(
      (p) =>
        p.status !== "completed" &&
        p.status !== "archived" &&
        isStaleStatus(latestByProject.get(p.id) ?? null, STALE_DAYS)
    )
    .slice(0, ATTENTION_LIMIT)
    .map((p) => ({
      id: p.id,
      href: `/projects/${p.id}`,
      primary: p.name,
      secondary: latestByProject.has(p.id)
        ? `Last update ${formatDate(latestByProject.get(p.id)!)}`
        : "No status update yet",
    }));
}
