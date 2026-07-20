import Link from "next/link";
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

const VALUE_TONE: Record<Tone, string> = {
  neutral: "",
  info: "text-blue-700 dark:text-blue-400",
  good: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-700 dark:text-amber-400",
  critical: "text-red-700 dark:text-red-400",
};

const ICON_TONE: Record<Tone, string> = {
  neutral: "bg-foreground/5 text-foreground/60",
  info: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  good: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  critical: "bg-red-500/10 text-red-600 dark:text-red-400",
};

// Six focused KPIs. Every tile pairs its number with a one-line interpretation (a bare "6" is
// noise) and links to the place that answers "which exactly" -- the tile is the glance, the target
// is the detail. Four core tiles always render; the two finance tiles are added only when the
// viewer has finance visibility.
export function SummaryCards(props: {
  activeProjects: number;
  planningProjects: number;
  totalProjects: number;
  atRiskProjects: number;
  criticalProjects: number;
  warningProjects: number;
  teamUtilizationPct: number | null;
  overallocatedCount: number;
  approachingDeadlines: number;
  nextDeadline: { name: string; days: number } | null;
  totalActiveBudget: number | null;
  budgetRemaining: number | null;
  finance: FinanceSummary | null;
}) {
  const util = props.teamUtilizationPct;
  const utilTone: Tone =
    util === null ? "neutral" : util > 100 ? "critical" : util >= 90 ? "warn" : "info";

  const remainingRatio =
    props.totalActiveBudget && props.totalActiveBudget > 0 && props.budgetRemaining !== null
      ? props.budgetRemaining / props.totalActiveBudget
      : null;
  const budgetTone: Tone =
    remainingRatio === null ? "neutral" : remainingRatio < 0.1 ? "critical" : remainingRatio < 0.25 ? "warn" : "info";
  const spentPct =
    props.totalActiveBudget && props.totalActiveBudget > 0 && props.budgetRemaining !== null
      ? Math.round(((props.totalActiveBudget - props.budgetRemaining) / props.totalActiveBudget) * 100)
      : null;

  const marginPctVal = props.finance?.blendedMarginPct ?? null;
  const marginTone: Tone =
    marginPctVal === null ? "neutral" : marginPctVal < 15 ? "critical" : marginPctVal < 25 ? "warn" : "good";

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatTile
        icon={FolderKanban}
        label="Active projects"
        value={String(props.activeProjects)}
        context={`of ${props.totalProjects} · ${props.planningProjects} in planning`}
        tone="info"
        href="/projects?status=active"
      />
      <StatTile
        icon={AlertTriangle}
        label="Needs attention"
        value={String(props.atRiskProjects)}
        context={
          props.atRiskProjects === 0
            ? "all projects healthy"
            : `${props.criticalProjects} critical, ${props.warningProjects} warning`
        }
        tone={props.atRiskProjects > 0 ? "warn" : "good"}
        href="#needs-attention"
      />
      <StatTile
        icon={Gauge}
        label="Team load"
        value={util === null ? "—" : `${util.toFixed(0)}%`}
        context={
          props.overallocatedCount > 0
            ? `avg · ${props.overallocatedCount} over capacity`
            : "avg · all within capacity"
        }
        tone={utilTone}
        href="/workload"
      />
      <StatTile
        icon={CalendarClock}
        label="Deadlines (14d)"
        value={String(props.approachingDeadlines)}
        context={
          props.nextDeadline
            ? `next: ${truncate(props.nextDeadline.name, 18)} in ${props.nextDeadline.days}d`
            : "none scheduled"
        }
        tone={props.approachingDeadlines > 0 ? "warn" : "neutral"}
        href="/projects"
      />
      {props.finance && (
        <>
          <StatTile
            icon={Wallet}
            label="Budget remaining"
            value={formatMoney(props.budgetRemaining)}
            context={
              props.totalActiveBudget !== null
                ? `of ${formatMoney(props.totalActiveBudget)}${spentPct !== null ? ` · ${spentPct}% spent` : ""}`
                : "active projects"
            }
            tone={budgetTone}
            href="/budgets"
          />
          <StatTile
            icon={TrendingUp}
            label="Blended margin"
            value={formatMoney(props.finance.totalMargin)}
            context={marginPctVal === null ? "active projects" : `${marginPctVal.toFixed(1)}% of client value`}
            tone={marginTone}
            href="/budgets"
          />
        </>
      )}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function StatTile({
  icon: Icon,
  label,
  value,
  context,
  tone,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  context: string;
  tone: Tone;
  href: string;
}) {
  return (
    <Link href={href} className="block rounded-xl transition focus-visible:outline-2 focus-visible:outline-ring">
      <Card size="sm" className="h-full transition hover:ring-foreground/25">
        <CardContent className="flex items-start gap-3">
          <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${ICON_TONE[tone]}`}>
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="truncate text-sm text-muted-foreground">{label}</p>
            <p className={`text-2xl leading-tight font-semibold ${VALUE_TONE[tone]}`}>{value}</p>
            <p className="truncate text-xs text-muted-foreground">{context}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
