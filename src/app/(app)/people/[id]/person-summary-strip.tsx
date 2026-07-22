import { Card, CardContent } from "@/components/ui/card";
import { utilizationBarClasses, utilizationClass } from "@/lib/workload";
import { humanize } from "../types";
import { formatPeriod } from "./types";
import type { TimeOffRow } from "./types";

// Context-line tones reuse the utilization palette (no new colors): amber once fully loaded,
// red once over.
const UTILIZATION_CONTEXT_TONE: Record<ReturnType<typeof utilizationClass>, string> = {
  available: "text-muted-foreground",
  partial: "text-muted-foreground",
  full: "text-amber-700 dark:text-amber-400",
  overallocated: "text-red-700 dark:text-red-400",
};

// The "can I put work on this person" strip under the name -- same labeled-Cell anatomy as the
// project detail's ProjectHeaderStrip. Replaces the old CapacitySummaryCard (removed in feedback
// round 1) with assignment-decision framing: workload, where the time goes, what's left, and the
// next absence. Purely presentational.
export function PersonSummaryStrip({
  allocationPct,
  capacityHours,
  activeProjectNames,
  activeProjectCount,
  nextTimeOff,
}: {
  allocationPct: number;
  capacityHours: number;
  activeProjectNames: string[];
  /** SECURITY DEFINER count off the workload view -- may exceed the RLS-scoped names list. */
  activeProjectCount: number;
  nextTimeOff: TimeOffRow | null;
}) {
  const pct = allocationPct;
  const allocated = Math.round((pct / 100) * capacityHours * 10) / 10;
  const free = Math.round((capacityHours - allocated) * 10) / 10;
  const overallocated = pct > 100;
  const severity = utilizationClass(pct);

  return (
    <Card size="sm">
      <CardContent>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Workload
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold tabular-nums">
                {allocated} / {capacityHours} h
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${utilizationBarClasses(pct)}`}
                style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
              />
            </div>
            <div className={`text-xs tabular-nums ${UTILIZATION_CONTEXT_TONE[severity]}`}>
              {Math.round(pct)}% of capacity
            </div>
          </div>

          <Cell
            label="Active projects"
            value={String(activeProjectCount)}
            context={
              activeProjectNames.length > 0 ? activeProjectNames.join(", ") : "no active assignments"
            }
            truncateContext
          />

          {overallocated ? (
            <Cell
              label="Remaining capacity"
              value="Overallocated"
              context={`+${Math.round((allocated - capacityHours) * 10) / 10} h over`}
              contextClass="text-red-700 dark:text-red-400"
            />
          ) : (
            <Cell label="Remaining capacity" value={`${free} h`} context={`of ${capacityHours} h/week`} />
          )}

          <Cell
            label="Upcoming time off"
            value={nextTimeOff ? capitalize(humanize(nextTimeOff.type)) : "—"}
            context={
              nextTimeOff
                ? formatPeriod(nextTimeOff.starts_on, nextTimeOff.ends_on)
                : "nothing scheduled"
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function Cell({
  label,
  value,
  context,
  contextClass = "text-muted-foreground",
  truncateContext = false,
}: {
  label: string;
  value: string;
  context: string;
  contextClass?: string;
  truncateContext?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className={`text-xs ${truncateContext ? "truncate " : ""}${contextClass}`} title={truncateContext ? context : undefined}>
        {context}
      </div>
    </div>
  );
}
