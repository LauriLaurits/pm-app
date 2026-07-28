import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  FolderKanban,
  Gauge,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/budget";

type Tone = "neutral" | "info" | "good" | "warn" | "critical";

// Color is reserved for "something needs you": the context line only picks up amber/red when it
// carries a warning/critical reason, otherwise it stays muted. The icon chip no longer follows
// this tone -- it's a fixed per-tile hue instead (see HUE_CLASS below), matching the mockup where
// each KPI tile owns its own pastel regardless of the number's severity.
const CONTEXT_TONE: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  info: "text-muted-foreground",
  good: "text-muted-foreground",
  warn: "text-amber-700 dark:text-amber-400",
  critical: "text-red-700 dark:text-red-400",
};

// Per-tile pastel icon chip hues -- same `bg-*-500/10 text-*-600 dark:text-*-400` pastel pair
// convention as src/components/stat-card.tsx, one fixed hue per tile so the row reads as five
// distinct KPIs at a glance instead of a wash of identical graphite chips.
const HUE_CLASS = {
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
} as const;
type Hue = keyof typeof HUE_CLASS;

// Five action-first KPIs. Every tile pairs its number with a one-line interpretation (a bare "6"
// is noise) and links to the place that answers "which exactly" -- the tile is the glance, the
// target is the detail. Four core tiles always render; the invoices tile is added only when the
// viewer has budget visibility (hidden entirely, not zeroed, for viewers who can't see money).
export function SummaryCards(props: {
  activeProjects: number;
  planningProjects: number;
  totalProjects: number;
  needsAttentionCount: number;
  needsAttentionCritical: number;
  needsAttentionWarning: number;
  teamUtilizationPct: number | null;
  availableCount: number;
  peopleCount: number;
  approachingDeadlines: number;
  nextDeadline: { name: string; days: number } | null;
  invoicesWaiting: { count: number; outstanding: number } | null;
}) {
  const util = props.teamUtilizationPct;
  const utilTone: Tone =
    util === null ? "neutral" : util > 100 ? "critical" : util >= 90 ? "warn" : "info";

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <StatTile
        icon={FolderKanban}
        label="Active projects"
        value={String(props.activeProjects)}
        context={`of ${props.totalProjects} · ${props.planningProjects} in planning`}
        tone="info"
        hue="blue"
        href="/projects?status=active"
      />
      <StatTile
        icon={AlertTriangle}
        label="Needs attention"
        value={String(props.needsAttentionCount)}
        context={
          props.needsAttentionCount === 0
            ? "all clear"
            : `${props.needsAttentionCritical} critical, ${props.needsAttentionWarning} warning`
        }
        tone={props.needsAttentionCount > 0 ? "warn" : "good"}
        hue="amber"
        href="#needs-attention"
      />
      <StatTile
        icon={Gauge}
        label="Team load"
        value={util === null ? "—" : `${util.toFixed(0)}%`}
        context={`${props.availableCount} of ${props.peopleCount} available`}
        tone={utilTone}
        hue="emerald"
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
        hue="violet"
        href="/projects"
      />
      {props.invoicesWaiting && (
        <StatTile
          icon={Receipt}
          label="Invoices waiting"
          value={String(props.invoicesWaiting.count)}
          context={
            props.invoicesWaiting.count > 0
              ? `${formatMoney(props.invoicesWaiting.outstanding)} outstanding`
              : "all settled"
          }
          tone={props.invoicesWaiting.count > 0 ? "warn" : "good"}
          hue="sky"
          href="/budgets"
        />
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
  hue,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  context: string;
  tone: Tone;
  hue: Hue;
  href: string;
}) {
  return (
    <Link href={href} className="block rounded-xl transition focus-visible:outline-2 focus-visible:outline-ring">
      <Card size="sm" className="h-full transition hover:ring-foreground/25">
        <CardContent className="flex items-start gap-3">
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${HUE_CLASS[hue]}`}>
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="truncate text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl leading-tight font-semibold tabular-nums">{value}</p>
            <p className={`truncate text-xs ${CONTEXT_TONE[tone]}`}>{context}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
