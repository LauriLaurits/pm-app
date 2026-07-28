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

// Color is reserved for "something needs you": healthy/informational tiles stay monochrome
// (graphite chip, ink value) so an amber or red tile is the only thing that pulls the eye.
const VALUE_TONE: Record<Tone, string> = {
  neutral: "",
  info: "",
  good: "",
  warn: "text-amber-700 dark:text-amber-400",
  critical: "text-red-700 dark:text-red-400",
};

const ICON_TONE: Record<Tone, string> = {
  neutral: "bg-foreground/[0.04] text-foreground/55",
  info: "bg-foreground/[0.04] text-foreground/55",
  good: "bg-foreground/[0.04] text-foreground/55",
  warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  critical: "bg-red-500/10 text-red-600 dark:text-red-400",
};

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
        href="#needs-attention"
      />
      <StatTile
        icon={Gauge}
        label="Team load"
        value={util === null ? "—" : `${util.toFixed(0)}%`}
        context={`${props.availableCount} of ${props.peopleCount} available`}
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
