import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/budget";

export type FinanceSummary = {
  totalInternalCost: number | null;
  totalMargin: number | null;
  blendedMarginPct: number | null;
};

// The base eight cards always render (each already scoped to whatever this viewer's RLS-gated
// reads returned -- a member's project_list_rows is just their own projects, not a special case
// here). Only the two finance tiles (internal cost, blended margin) are conditionally added, and
// only when `finance` is non-null -- mirrors BudgetCards on /budgets. Never render them with a
// wall of "—" for a non-finance viewer; omit the tiles entirely instead.
export function SummaryCards({
  activeProjects,
  atRiskProjects,
  totalActiveBudget,
  budgetRemaining,
  billableHoursThisMonth,
  teamUtilizationPct,
  overallocatedCount,
  approachingDeadlines,
  finance,
}: {
  activeProjects: number;
  atRiskProjects: number;
  totalActiveBudget: number | null;
  budgetRemaining: number | null;
  billableHoursThisMonth: number;
  teamUtilizationPct: number | null;
  overallocatedCount: number;
  approachingDeadlines: number;
  finance: FinanceSummary | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatTile label="Active projects" value={String(activeProjects)} />
      <StatTile
        label="Projects at risk"
        value={String(atRiskProjects)}
        tone={atRiskProjects > 0 ? "warn" : undefined}
      />
      <StatTile label="Total active budget" value={formatMoney(totalActiveBudget)} />
      <StatTile label="Budget remaining" value={formatMoney(budgetRemaining)} />
      <StatTile label="Billable hours (this month)" value={`${billableHoursThisMonth}h`} />
      <StatTile
        label="Team utilization"
        value={teamUtilizationPct === null ? "—" : `${teamUtilizationPct.toFixed(0)}%`}
      />
      <StatTile
        label="Overallocated people"
        value={String(overallocatedCount)}
        tone={overallocatedCount > 0 ? "critical" : undefined}
      />
      <StatTile
        label="Approaching deadlines"
        value={String(approachingDeadlines)}
        tone={approachingDeadlines > 0 ? "warn" : undefined}
      />
      {finance && (
        <>
          <StatTile label="Total internal cost" value={formatMoney(finance.totalInternalCost)} />
          <StatTile
            label="Blended margin"
            value={formatMoney(finance.totalMargin)}
            sub={finance.blendedMarginPct === null ? undefined : `${finance.blendedMarginPct.toFixed(1)}%`}
          />
        </>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "warn" | "critical";
}) {
  const toneClass =
    tone === "critical"
      ? "text-red-700 dark:text-red-400"
      : tone === "warn"
        ? "text-amber-700 dark:text-amber-400"
        : "";
  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`text-xl font-semibold ${toneClass}`}>
          {value}
          {sub && <span className="ml-2 text-sm font-normal text-muted-foreground">{sub}</span>}
        </CardTitle>
      </CardContent>
    </Card>
  );
}
