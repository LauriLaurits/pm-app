import {
  AlertTriangle,
  CalendarClock,
  FolderKanban,
  Gauge,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/budget";

export type FinanceSummary = {
  totalMargin: number | null;
  blendedMarginPct: number | null;
};

type Tone = "neutral" | "info" | "good" | "warn" | "critical";

// Value text color -- tone always MEANS something (a state), never decoration. "neutral" is the
// plain foreground for counts that carry no good/bad reading (e.g. active-project count).
const VALUE_TONE: Record<Tone, string> = {
  neutral: "",
  info: "text-blue-700 dark:text-blue-400",
  good: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-700 dark:text-amber-400",
  critical: "text-red-700 dark:text-red-400",
};

// Icon chip background/foreground, keyed to the same tone so a card's icon and its number read as
// one signal. Full static class strings (Tailwind can't compose `bg-${c}` at build time).
const ICON_TONE: Record<Tone, string> = {
  neutral: "bg-foreground/5 text-foreground/60",
  info: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  good: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  critical: "bg-red-500/10 text-red-600 dark:text-red-400",
};

// Six focused KPIs, each a distinct actionable signal (see the dashboard usability pass): four core
// tiles always render as one row, the two finance tiles add a short second row only when `finance`
// is non-null -- never a wall of "—" for a non-finance viewer. Workload appears here once (team
// utilization); the per-person breakdown is the capacity chart and the overallocated list, not a
// third tile. Budget is one "remaining of total" tile, not two.
export function SummaryCards({
  activeProjects,
  atRiskProjects,
  teamUtilizationPct,
  approachingDeadlines,
  totalActiveBudget,
  budgetRemaining,
  finance,
}: {
  activeProjects: number;
  atRiskProjects: number;
  teamUtilizationPct: number | null;
  approachingDeadlines: number;
  totalActiveBudget: number | null;
  budgetRemaining: number | null;
  finance: FinanceSummary | null;
}) {
  const util = teamUtilizationPct;
  const utilTone: Tone =
    util === null ? "neutral" : util > 100 ? "critical" : util >= 90 ? "warn" : "info";

  const remainingRatio =
    totalActiveBudget && totalActiveBudget > 0 && budgetRemaining !== null
      ? budgetRemaining / totalActiveBudget
      : null;
  const budgetTone: Tone =
    remainingRatio === null
      ? "neutral"
      : remainingRatio < 0.1
        ? "critical"
        : remainingRatio < 0.25
          ? "warn"
          : "info";

  const marginPctVal = finance?.blendedMarginPct ?? null;
  const marginTone: Tone =
    marginPctVal === null ? "neutral" : marginPctVal < 15 ? "critical" : marginPctVal < 25 ? "warn" : "good";

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatTile
        icon={FolderKanban}
        label="Active projects"
        value={String(activeProjects)}
        tone="info"
      />
      <StatTile
        icon={AlertTriangle}
        label="Projects at risk"
        value={String(atRiskProjects)}
        tone={atRiskProjects > 0 ? "warn" : "good"}
      />
      <StatTile
        icon={Gauge}
        label="Team utilization"
        value={util === null ? "—" : `${util.toFixed(0)}%`}
        tone={utilTone}
      />
      <StatTile
        icon={CalendarClock}
        label="Deadlines within 14 days"
        value={String(approachingDeadlines)}
        tone={approachingDeadlines > 0 ? "warn" : "neutral"}
      />
      {finance && (
        <>
          <StatTile
            icon={Wallet}
            label="Budget remaining"
            value={formatMoney(budgetRemaining)}
            sub={totalActiveBudget !== null ? `of ${formatMoney(totalActiveBudget)}` : undefined}
            tone={budgetTone}
          />
          <StatTile
            icon={TrendingUp}
            label="Blended margin"
            value={formatMoney(finance.totalMargin)}
            sub={marginPctVal === null ? undefined : `${marginPctVal.toFixed(1)}%`}
            tone={marginTone}
          />
        </>
      )}
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone: Tone;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-start gap-3">
        <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${ICON_TONE[tone]}`}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          <p className={`text-xl font-semibold ${VALUE_TONE[tone]}`}>
            {value}
            {sub && <span className="ml-1.5 text-sm font-normal text-muted-foreground">{sub}</span>}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
