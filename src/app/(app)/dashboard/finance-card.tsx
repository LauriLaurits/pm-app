import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { consumptionBarClasses, formatMoney } from "@/lib/budget";
import type { FinanceOverview } from "./compute";

// Only ever mounted when computeFinanceOverview returned non-null (i.e. the viewer has budget
// visibility) -- page.tsx does the null check, this component can assume a real overview.
export function FinanceCard({ overview }: { overview: NonNullable<FinanceOverview> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Financial overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Invoiced this month</div>
            <div className="text-xl font-semibold tabular-nums">{formatMoney(overview.invoicedThisMonth)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Outstanding</div>
            <div className="text-xl font-semibold tabular-nums">{formatMoney(overview.outstanding)}</div>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">Top budget usage</div>
          {overview.topConsumers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active budgets to show.</p>
          ) : (
            <ul className="space-y-2.5">
              {overview.topConsumers.map((c) => (
                <li key={c.id}>
                  <Link href={`/projects/${c.id}/budget`} className="block text-sm hover:underline">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate">{c.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{Math.round(c.pct)}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${consumptionBarClasses(c.pct)}`}
                        style={{ width: `${Math.min(Math.max(c.pct, 0), 100)}%` }}
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Finance-visibility-only line -- computeFinanceOverview leaves margin null for viewers
            without view_internal_cost, even though they still see the two stat blocks above. */}
        {overview.margin && (
          <div className="border-t pt-3 text-sm">
            <span className="text-muted-foreground">Margin </span>
            <span className="font-medium tabular-nums">
              {formatMoney(overview.margin.amount)} ({overview.margin.pct.toFixed(1)}%)
            </span>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Link href="/budgets" className="text-sm font-medium hover:underline">
          View all budgets
        </Link>
      </CardFooter>
    </Card>
  );
}
