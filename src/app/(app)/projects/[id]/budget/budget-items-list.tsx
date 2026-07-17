import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/budget";
import { humanize, type BudgetItemRow } from "./types";
import { BudgetItemDeleteButton } from "./budget-item-delete-button";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** Ledger of invoice/payment/planned_cost/actual_cost entries, newest first ("change" entries
 * get their own card -- BudgetChanges). `items` is pre-filtered by the caller (page.tsx) from a
 * list already scoped by budget_items' own RLS -- a non-finance viewer never receives
 * planned_cost/actual_cost rows here at all, so nothing further needs gating in this component.
 * Delete is only offered when the caller holds manage_budget (canManageBudget). */
export function BudgetItemsList({
  projectId,
  items,
  canManageBudget,
}: {
  projectId: string;
  items: BudgetItemRow[];
  canManageBudget: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget entries</CardTitle>
        <CardDescription>Invoices, payments, and internal cost lines, newest first</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-start justify-between gap-4 border-b pb-2 last:border-0 last:pb-0"
          >
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{humanize(item.item_type)}</Badge>
                <span className="text-sm font-medium">{item.name}</span>
              </div>
              <div className="text-xs text-muted-foreground">{formatDate(item.occurred_on)}</div>
              {item.note && <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm font-semibold whitespace-nowrap">{formatMoney(Number(item.amount))}</div>
              {canManageBudget && (
                <BudgetItemDeleteButton projectId={projectId} itemId={item.id} itemName={item.name} />
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
