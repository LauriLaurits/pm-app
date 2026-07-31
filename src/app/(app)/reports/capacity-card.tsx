import Link from "next/link";
import { ChartCard, ChartEmptyState } from "@/components/charts/chart-card";
import { PersonAvatar } from "@/components/person-avatar";
import { utilizationBarClasses } from "@/lib/workload";
import type { CapacityRow } from "./types";

const TOP_N = 8;

// "Capacity vs allocation" -- top 8 people by allocation, most booked first. Ungated (workload has
// no view_budget/view_internal_cost tier of its own), same as the pre-v2 CapacityChart it
// replaces.
export function CapacityCard({ rows }: { rows: CapacityRow[] }) {
  const top = [...rows].sort((a, b) => b.pct - a.pct).slice(0, TOP_N);

  return (
    <ChartCard
      title="Capacity vs allocation"
      description="Allocated hours against weekly capacity, most booked first"
      action={
        <Link href="/workload" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          View full
        </Link>
      }
    >
      {top.length === 0 ? (
        <ChartEmptyState />
      ) : (
        <ul className="space-y-3">
          {top.map((row) => (
            <li key={row.id} className="flex items-center gap-3">
              <Link href={`/people/${row.id}`} className="shrink-0">
                <PersonAvatar name={row.name} avatarUrl={row.avatarUrl} className="size-7" />
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/people/${row.id}`} className="block truncate text-sm font-medium hover:underline">
                  {row.name}
                </Link>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${utilizationBarClasses(row.pct)}`}
                    style={{ width: `${Math.min(Math.max(row.pct, 0), 100)}%` }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-medium tabular-nums">{Math.round(row.pct)}%</div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {row.allocatedHours}h / {row.capacityHours}h
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
