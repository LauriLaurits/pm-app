import Link from "next/link";
import { ChartCard, ChartEmptyState } from "@/components/charts/chart-card";
import { consumptionBarClasses, formatMoney } from "@/lib/budget";
import type { UtilizationRow } from "./types";

const TOP_N = 6;

// "Budget utilization" -- top 6 projects by consumption, highest first. Only ever mounted when
// the caller has budget visibility (page.tsx omits the whole card otherwise, matching the KPI
// row's totalInvoiced gating) -- rows are `buildUtilizationRows`' straight column mapping, so a
// project WITHOUT a budget of its own (client_amount/consumptionPct null even under a portfolio
// that otherwise has visibility) is filtered out here rather than sorted to the top as a fake 0%.
export function UtilizationCard({ rows }: { rows: UtilizationRow[] }) {
  const top = rows
    .filter((r): r is UtilizationRow & { consumptionPct: number; budget: number } =>
      r.consumptionPct !== null && r.budget !== null
    )
    .sort((a, b) => b.consumptionPct - a.consumptionPct)
    .slice(0, TOP_N);

  return (
    <ChartCard
      title="Budget utilization"
      description="Highest-consuming projects, invoiced against budget"
      action={
        <Link href="/budgets" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          View full report
        </Link>
      }
    >
      {top.length === 0 ? (
        <ChartEmptyState />
      ) : (
        <ul className="space-y-4">
          {top.map((row) => (
            <li key={row.id}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <Link
                  href={`/projects/${row.id}/budget`}
                  className="truncate font-medium transition-opacity hover:opacity-70"
                >
                  {row.name}
                </Link>
                <span
                  className={
                    "shrink-0 tabular-nums font-medium " +
                    ((row.remaining ?? 0) < 0 ? "text-red-600 dark:text-red-400" : "")
                  }
                >
                  {formatMoney(row.remaining)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${consumptionBarClasses(row.consumptionPct)}`}
                  style={{ width: `${Math.min(Math.max(row.consumptionPct, 0), 100)}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                {formatMoney(row.invoiced)} / {formatMoney(row.budget)} ({Math.round(row.consumptionPct)}%)
              </div>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
