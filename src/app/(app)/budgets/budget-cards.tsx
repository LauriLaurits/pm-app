import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/budget";

// Summary cards across every project row this viewer can see. The client-tier cards always
// render (showing "—" when nothing is visible, e.g. a member with no view_budget) -- only the
// finance-tier cards (internal cost + blended margin) are conditionally omitted, per the plan,
// since they'd otherwise just show a wall of "—" for every non-finance viewer.
export function BudgetCards({
  totalClientAmount,
  totalInvoiced,
  totalRemaining,
  hasFinanceVisibility,
  totalInternalCost,
  totalMargin,
  blendedMarginPct,
}: {
  totalClientAmount: number | null;
  totalInvoiced: number | null;
  totalRemaining: number | null;
  hasFinanceVisibility: boolean;
  totalInternalCost: number | null;
  totalMargin: number | null;
  blendedMarginPct: number | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      <SummaryCard label="Total client budget" value={formatMoney(totalClientAmount)} />
      <SummaryCard label="Invoiced" value={formatMoney(totalInvoiced)} />
      <SummaryCard label="Remaining" value={formatMoney(totalRemaining)} />
      {hasFinanceVisibility && (
        <>
          <SummaryCard label="Total internal cost" value={formatMoney(totalInternalCost)} />
          <SummaryCard
            label="Blended margin"
            value={formatMoney(totalMargin)}
            sub={blendedMarginPct === null ? undefined : `${blendedMarginPct.toFixed(1)}%`}
          />
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-xl font-semibold">
          {value}
          {sub && <span className="ml-2 text-sm font-normal text-muted-foreground">{sub}</span>}
        </CardTitle>
      </CardContent>
    </Card>
  );
}
