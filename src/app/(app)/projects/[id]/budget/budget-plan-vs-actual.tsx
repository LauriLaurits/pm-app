import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/budget";

// Plan vs actual: the client-tier row (planned client budget vs invoiced) renders whenever
// client_amount is visible; the finance-tier row (planned vs actual internal cost) only renders
// when both cost totals are visible (view_internal_cost) -- both come from columns the caller
// already fetched off the gated views, never recomputed here.
export function BudgetPlanVsActual({
  clientAmount,
  invoiced,
  plannedCost,
  actualCost,
}: {
  clientAmount: number | null;
  invoiced: number | null;
  plannedCost: number | null;
  actualCost: number | null;
}) {
  if (clientAmount === null) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan vs actual</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Metric label="Client budget" value={formatMoney(clientAmount)} />
        <Metric label="Invoiced" value={formatMoney(invoiced)} />
        {plannedCost !== null && actualCost !== null && (
          <>
            <Metric label="Planned internal cost" value={formatMoney(plannedCost)} />
            <Metric label="Actual internal cost" value={formatMoney(actualCost)} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <CardDescription>{label}</CardDescription>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
