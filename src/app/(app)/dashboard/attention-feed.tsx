import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PersonAvatar } from "@/components/person-avatar";
import { cn } from "@/lib/utils";
import { DERIVED_HEALTH_DOT } from "@/lib/health";
import type { AttentionSeverity, FeedItem } from "./compute";

const FEED_CAP = 10;

// Info rows (no-PM, stale status, expiring credentials) have no critical/warning color of their
// own -- DERIVED_HEALTH_DOT only covers "warning"/"critical" -- so they get a quiet neutral dot
// instead of borrowing a health color that doesn't apply to them.
const SEVERITY_DOT_CLASS: Record<AttentionSeverity, string> = {
  critical: DERIVED_HEALTH_DOT.critical,
  warning: DERIVED_HEALTH_DOT.warning,
  info: "bg-muted-foreground/40",
};

// One chip label per source. `kind: "project"` covers both the critical and warning tiers of
// deriveHealth, whose reasons are deterministic templates (lib/health.ts): "N days overdue" /
// "due in N days" for the deadline signal, "N% of budget used" / "over budget (N%)" for the
// budget signal, "progress behind schedule" for the schedule-lag signal. Severity alone can't
// tell deadline from budget apart (a critical item can be over-budget with no overdue deadline),
// so the chip is picked by matching item.reason against those templates instead. Every other
// kind maps 1:1 to a fixed label.
const KIND_LABEL: Record<Exclude<FeedItem["kind"], "project">, string> = {
  budget: "Budget",
  person: "Workload",
  pm: "PM",
  status: "Status",
  credential: "Credential",
};

function chipLabel(item: FeedItem): string {
  if (item.kind === "project") {
    if (item.reason.includes("overdue") || item.reason.includes("due in")) return "Deadline";
    if (item.reason.includes("budget")) return "Budget";
    return "Deadline"; // schedule-lag-only reason ("progress behind schedule"): no better bucket
  }
  return KIND_LABEL[item.kind];
}

// Tinted pill per chip label -- critical severity always wins and renders as a red "Critical"
// pill regardless of source (the strongest signal on the row), since kind "budget" (over-budget)
// is always critical and would otherwise never show its own distinct color. Warning-tier chips
// (Budget/Workload/Deadline) get their own hue; info-tier chips (PM/Status/Credential) stay the
// plain muted outline Badge already renders by default.
const PILL_CRITICAL =
  "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-400";
const PILL_BUDGET =
  "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-400";
const PILL_WORKLOAD =
  "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-400";
const PILL_DEADLINE =
  "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:border-yellow-500/40 dark:bg-yellow-500/15 dark:text-yellow-400";

function chipDisplay(item: FeedItem): { label: string; className: string } {
  if (item.severity === "critical") return { label: "Critical", className: PILL_CRITICAL };
  const label = chipLabel(item);
  const className =
    label === "Budget" ? PILL_BUDGET : label === "Workload" ? PILL_WORKLOAD : label === "Deadline" ? PILL_DEADLINE : "";
  return { label, className };
}

// Unified "go fix this" queue (Task 2's buildAttentionFeed) replacing the old six separate
// AttentionList boxes -- one ranked list, capped at 10 with a link to see the rest, instead of six
// panels (several empty) fighting for attention. The KPI tile's "Needs attention" count
// (page.tsx) is `items.length` from the same feed, so the two numbers can never drift apart.
export function AttentionFeed({ items }: { items: FeedItem[] }) {
  const visible = items.slice(0, FEED_CAP);
  const overflow = items.length - visible.length;

  return (
    <Card id="needs-attention" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Needs your attention</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Nothing needs your attention. 🎉</p>
        ) : (
          <ul className="-mx-2">
            {visible.map((item, i) => {
              const { label, className } = chipDisplay(item);
              return (
                <li key={`${item.kind}-${item.href}-${i}`}>
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <span
                      aria-hidden
                      className={`size-1.5 shrink-0 rounded-full ${SEVERITY_DOT_CLASS[item.severity]}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{item.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.reason}</span>
                    </span>
                    <Badge variant="outline" className={cn("shrink-0", className)}>
                      {label}
                    </Badge>
                    {item.avatarName && (
                      <PersonAvatar name={item.avatarName} avatarUrl={item.avatarUrl ?? null} className="size-6 shrink-0" />
                    )}
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground/60" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {overflow > 0 && (
          <Link
            href="/projects"
            className="mt-1 block px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            +{overflow} more need review
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
