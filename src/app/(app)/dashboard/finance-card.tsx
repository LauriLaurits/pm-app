import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { consumptionBarClasses, formatMoney } from "@/lib/budget";
import { FinanceMonthSelector, type FinMonth } from "./finance-period-selector";
import type { FinanceOverview } from "./compute";

const FIN_MONTH_WORDS: Record<FinMonth, string> = { this: "this month", last: "last month" };

// Both bars already clamp their width to [0, 100] -- the text labels next to them need the same
// clamp. monthInvoicedPct's numerator (fetchMonthInvoiceTotal) and remainingPct's numerator
// (compute.ts's `remaining`) are each scoped to match their shared denominator (active projects'
// client_amount) so this shouldn't normally exceed 100%, but it's cheap insurance against a
// "134% of portfolio value" label if that invariant is ever violated by a future data edge case.
function clampPct(pct: number): number {
  return Math.min(Math.max(pct, 0), 100);
}

// Only ever mounted when computeFinanceOverview returned non-null (i.e. the viewer has budget
// visibility) -- page.tsx does the null check, this component can assume a real overview.
export function FinanceCard({
  overview,
  finMonth,
}: {
  overview: NonNullable<FinanceOverview>;
  finMonth: FinMonth;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Financial overview</CardTitle>
        <CardAction>
          <FinanceMonthSelector active={finMonth} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Invoiced {FIN_MONTH_WORDS[finMonth]}</div>
            <div className="text-xl font-semibold tabular-nums">{formatMoney(overview.monthInvoiced)}</div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${clampPct(overview.monthInvoicedPct)}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {Math.round(clampPct(overview.monthInvoicedPct))}% of portfolio value
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Remaining budget</div>
            <div className="text-xl font-semibold tabular-nums">{formatMoney(overview.remaining)}</div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-muted-foreground/40"
                style={{ width: `${clampPct(overview.remainingPct)}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{Math.round(clampPct(overview.remainingPct))}% left</div>
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

        <Button variant="outline" className="w-full" render={<Link href="/budgets" />}>
          View all budgets
        </Button>
      </CardContent>
    </Card>
  );
}
