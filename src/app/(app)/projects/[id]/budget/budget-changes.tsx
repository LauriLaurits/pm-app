import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/budget";
import type { BudgetItemRow } from "./types";
import { BudgetItemDeleteButton } from "./budget-item-delete-button";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Budget change history: budget_items where item_type = 'change', newest first. `changes` is
// pre-filtered by the caller (page.tsx) from a list already scoped by budget_items' own RLS --
// 'change' rows are client-facing (view_budget), no additional gating needed here. Now fed by
// real user-added entries via BudgetItemFormDialog/addBudgetItemAction, not just seed data --
// delete is offered whenever the caller holds manage_budget (canManageBudget).
export function BudgetChanges({
  projectId,
  changes,
  canManageBudget,
}: {
  projectId: string;
  changes: BudgetItemRow[];
  canManageBudget: boolean;
}) {
  if (changes.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget change history</CardTitle>
        <CardDescription>Scope and budget changes, newest first</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {changes.map((change) => (
          <div key={change.id} className="flex items-start justify-between gap-4 border-b pb-2 last:border-0 last:pb-0">
            <div>
              <div className="text-sm font-medium">{change.name}</div>
              <div className="text-xs text-muted-foreground">{formatDate(change.occurred_on)}</div>
              {change.note && <p className="mt-1 text-xs text-muted-foreground">{change.note}</p>}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm font-semibold whitespace-nowrap">{formatMoney(Number(change.amount))}</div>
              {canManageBudget && (
                <BudgetItemDeleteButton projectId={projectId} itemId={change.id} itemName={change.name} />
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
