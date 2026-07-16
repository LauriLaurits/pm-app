import { createClient } from "@/lib/supabase/server";
import { monthLabel } from "@/lib/dashboard";
import { SummaryCards } from "./summary-cards";
import { ChartsSection } from "./charts-section";
import { AttentionSections } from "./attention-sections";
import {
  computeBudgetSpentChart,
  computeCapacityChart,
  computeNeedsAttention,
  computeNoPm,
  computeOverBudget,
  computeOverallocatedPeople,
  computePlannedActualChart,
  computeRecentlyUpdated,
  computeStaleStatus,
  computeStatusChart,
  computeSummary,
} from "./compute";
import {
  fetchDashboardBase,
  fetchEstimatedHoursByProject,
  fetchExpiringCredentials,
  fetchLatestStatusUpdateByProject,
  fetchMonthlyActualCosts,
  fetchRecentTimeEntries,
} from "./queries";
import { formatDate, type AttentionItem, type ProjectBudgetRow, type ProjectListRow } from "./types";

function monthStartISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const [base, latestStatusByProject, expiringCreds, estimatedHoursByProject, recentTimeEntries] =
    await Promise.all([
      fetchDashboardBase(supabase),
      fetchLatestStatusUpdateByProject(supabase),
      fetchExpiringCredentials(supabase),
      fetchEstimatedHoursByProject(supabase),
      fetchRecentTimeEntries(supabase),
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

  const actualHoursByProject = new Map<string, number>();
  const monthStart = monthStartISO();
  let billableHoursThisMonth = 0;
  for (const entry of recentTimeEntries) {
    actualHoursByProject.set(entry.project_id, (actualHoursByProject.get(entry.project_id) ?? 0) + Number(entry.hours));
    if (entry.billable && entry.entry_date >= monthStart) billableHoursThisMonth += Number(entry.hours);
  }
  billableHoursThisMonth = Math.round(billableHoursThisMonth * 10) / 10;

  const monthlyCostRaw = summary.finance ? await fetchMonthlyActualCosts(supabase) : null;
  const monthlyCost = monthlyCostRaw?.map((p) => ({ month: monthLabel(p.month), cost: p.cost })) ?? null;

  const expiringCredItems: AttentionItem[] = expiringCreds.map((c) => ({
    id: c.id,
    href: `/projects/${c.project_id}/credentials`,
    primary: c.name,
    secondary: `${c.projectName ? `${c.projectName} — ` : ""}expires ${formatDate(c.expires_at)}`,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          The executive overview — what&apos;s active, what needs attention, and where the money and people stand.
        </p>
      </div>

      {hasError ? (
        <p className="text-destructive">Failed to load the dashboard. Try again.</p>
      ) : (
        <>
          <SummaryCards
            activeProjects={summary.activeProjects}
            atRiskProjects={summary.atRiskProjects}
            totalActiveBudget={summary.totalActiveBudget}
            budgetRemaining={summary.budgetRemaining}
            billableHoursThisMonth={billableHoursThisMonth}
            teamUtilizationPct={summary.teamUtilizationPct}
            overallocatedCount={summary.overallocatedCount}
            approachingDeadlines={summary.approachingDeadlines}
            finance={summary.finance}
          />

          <ChartsSection
            budgetSpent={computeBudgetSpentChart(budgetRows, summary.hasBudgetVisibility)}
            monthlyCost={monthlyCost}
            capacity={computeCapacityChart(people)}
            statusCounts={computeStatusChart(projects)}
            plannedActual={computePlannedActualChart(projects, estimatedHoursByProject, actualHoursByProject)}
          />

          <AttentionSections
            recentlyUpdated={computeRecentlyUpdated(projects)}
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
