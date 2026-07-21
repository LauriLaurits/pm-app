"use client";

import { deleteBudgetItemAction } from "@/app/actions/budget-items";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DESTRUCTIVE_ACTION_CLASS } from "@/lib/action-styles";

export function BudgetItemDeleteButton({
  projectId,
  itemId,
  itemName,
}: {
  projectId: string;
  itemId: number;
  itemName: string;
}) {
  return (
    <ConfirmDialog
      trigger={<Button size="sm" variant="ghost" className={DESTRUCTIVE_ACTION_CLASS} />}
      triggerLabel="Delete"
      title="Delete this budget item?"
      description={`Delete "${itemName}"? This can't be undone.`}
      onConfirm={() => deleteBudgetItemAction(projectId, itemId)}
    />
  );
}
