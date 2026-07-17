import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/budget";
import { sumOrNull, type PartBudgetRow } from "./types";
import { BudgetPartsFixed } from "./budget-parts-fixed";
import { BudgetPartsHourly } from "./budget-parts-hourly";

// Splits the part rows by billing_model and renders one table per model -- a "mixed" project
// (e.g. Retail e-shop) has both, and both roll up (independently, then combined below) to
// project totals. A project with only one billing model simply omits the other's table.
export function BudgetPartsTable({
  projectId,
  parts,
  canManageBudget,
  canManageCost,
}: {
  projectId: string;
  parts: PartBudgetRow[];
  canManageBudget: boolean;
  canManageCost: boolean;
}) {
  if (parts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        No parts on this project yet.
      </div>
    );
  }

  const fixedParts = parts.filter((p) => p.billing_model === "fixed");
  const hourlyParts = parts.filter((p) => p.billing_model === "hourly");
  const isMixed = fixedParts.length > 0 && hourlyParts.length > 0;

  const combinedClient = sumOrNull(parts.map((p) => p.client_price));
  const combinedCost = sumOrNull(parts.map((p) => p.actual_internal_cost));
  const combinedMargin = sumOrNull(parts.map((p) => p.margin));

  return (
    <div className="space-y-6">
      <BudgetPartsFixed
        projectId={projectId}
        parts={fixedParts}
        canManageBudget={canManageBudget}
        canManageCost={canManageCost}
      />
      <BudgetPartsHourly
        projectId={projectId}
        parts={hourlyParts}
        canManageBudget={canManageBudget}
        canManageCost={canManageCost}
      />

      {isMixed && (
        <Card size="sm">
          <CardContent className="flex flex-wrap items-center gap-6">
            <div>
              <CardDescription>Combined client amount</CardDescription>
              <CardTitle className="text-lg">{formatMoney(combinedClient)}</CardTitle>
            </div>
            <div>
              <CardDescription>Combined internal cost</CardDescription>
              <CardTitle className="text-lg">{formatMoney(combinedCost)}</CardTitle>
            </div>
            <div>
              <CardDescription>Combined margin</CardDescription>
              <CardTitle className="text-lg">{formatMoney(combinedMargin)}</CardTitle>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
