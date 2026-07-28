import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deadlineCountdown } from "@/lib/deadline";
import { daysUntil } from "@/lib/dashboard";
import { cn } from "@/lib/utils";
import type { DeadlineEntry } from "./compute";

// Same light+dark-safe border/bg/text triplet approach as CONSUMPTION_BADGE_CLASS (src/lib/budget.ts)
// and the "reveal" category style (activity/types.ts) -- red overdue, amber within 3 days, quiet
// neutral otherwise. Deliberately a tighter window than deadlineCountdown's own 14-day amber rule
// (used for the right-hand countdown instead): the date chip is meant to flag "act very soon".
const OVERDUE_CHIP = "border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-400";
const SOON_CHIP = "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-400";
const NEUTRAL_CHIP = "border-border bg-muted text-muted-foreground";

function chipTone(days: number): string {
  if (days < 0) return OVERDUE_CHIP;
  if (days <= 3) return SOON_CHIP;
  return NEUTRAL_CHIP;
}

function chipDate(dateISO: string, days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  // Day-first, no year -- the timeline never shows anything more than ~30 days out.
  return new Date(`${dateISO}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// Overdue + next-30-days project deadlines and undone milestones -- Task 2's buildDeadlineTimeline
// already merged, sorted (ascending by date), and capped this at 8; this just renders the list.
export function DeadlinesCard({ entries }: { entries: DeadlineEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Deadlines</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Nothing due in the next 30 days.</p>
        ) : (
          <ul className="-mx-2">
            {entries.map((entry, i) => {
              const days = daysUntil(entry.date);
              const countdown = deadlineCountdown(entry.date, "short");
              return (
                <li key={`${entry.kind}-${entry.projectId}-${entry.date}-${i}`}>
                  <Link
                    href={`/projects/${entry.projectId}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <Badge variant="outline" className={cn("shrink-0 tabular-nums", chipTone(days))}>
                      {chipDate(entry.date, days)}
                    </Badge>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{entry.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{entry.projectName}</span>
                    </span>
                    <span
                      className={`shrink-0 text-xs tabular-nums whitespace-nowrap ${countdown.toneClass}`}
                    >
                      {countdown.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
