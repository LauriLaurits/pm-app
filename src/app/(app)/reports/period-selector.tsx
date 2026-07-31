import Link from "next/link";
import { cn } from "@/lib/utils";

export const PERIOD_OPTIONS = [3, 6, 12] as const;
export type PeriodMonths = (typeof PERIOD_OPTIONS)[number];

// Segmented control for the reports page's time window. Links to ?months=N (a server round-trip
// that re-queries the time-based charts); the active option is filled. Server component -- no
// client JS. `label` (the ReportsWindow's human date-range string, e.g. "1 Feb – 31 Jul 2026") is
// optional -- the page header (this control's only remaining call site, now that the old
// ChartsSection's own label-less selector is gone) always passes it, per the v2 mockup; kept
// optional rather than tightened to required since it's a trivial, out-of-scope prop change (see
// Task 3's carried follow-up note).
export function PeriodSelector({ active, label }: { active: PeriodMonths; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-sm tabular-nums text-muted-foreground">{label}</span>}
      <div className="inline-flex items-center gap-1 rounded-lg bg-muted/60 p-0.5" role="group" aria-label="Time window">
        {PERIOD_OPTIONS.map((m) => {
          const on = m === active;
          return (
            <Link
              key={m}
              href={`/reports?months=${m}`}
              aria-current={on ? "true" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1 text-sm font-medium transition",
                on ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/10" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m}m
            </Link>
          );
        })}
      </div>
    </div>
  );
}
