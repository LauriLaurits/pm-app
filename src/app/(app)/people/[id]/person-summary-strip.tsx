import { BriefcaseBusiness, CalendarDays, Clock3, Gauge } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { formatDate } from "./types";
import type { TimeOffRow } from "./types";

export function PersonSummaryStrip({
  allocationPct,
  capacityHours,
  activeProjectCount,
  nextTimeOff,
}: {
  allocationPct: number;
  capacityHours: number;
  activeProjectNames: string[];
  activeProjectCount: number;
  nextTimeOff: TimeOffRow | null;
}) {
  const allocated = Math.round((allocationPct / 100) * capacityHours * 10) / 10;
  const remaining = Math.round((capacityHours - allocated) * 10) / 10;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        icon={Gauge}
        label="Workload"
        value={allocated + " / " + capacityHours + " h (" + Math.round(allocationPct) + "%)"}
        iconClass="bg-blue-500/10 text-blue-600 dark:text-blue-400"
      />
      <StatCard
        icon={BriefcaseBusiness}
        label="Active projects"
        value={String(activeProjectCount)}
        iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      />
      <StatCard
        icon={Clock3}
        label="Remaining capacity"
        value={remaining < 0 ? Math.abs(remaining) + " h over" : remaining + " h"}
        iconClass={
          remaining < 0
            ? "bg-red-500/10 text-red-600 dark:text-red-400"
            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        }
      />
      <StatCard
        icon={CalendarDays}
        label="Upcoming leave"
        value={nextTimeOff ? formatDate(nextTimeOff.starts_on) : "None"}
        iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-400"
      />
    </div>
  );
}
