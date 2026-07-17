"use client";

import { useState, useTransition } from "react";
import { deleteBudgetItemAction } from "@/app/actions/budget-items";
import { Button } from "@/components/ui/button";

export function BudgetItemDeleteButton({
  projectId,
  itemId,
  itemName,
}: {
  projectId: string;
  itemId: number;
  itemName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    if (!window.confirm(`Delete "${itemName}"? This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteBudgetItemAction(projectId, itemId);
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button size="sm" variant="ghost" onClick={onDelete} disabled={isPending}>
        {isPending ? "Deleting…" : "Delete"}
      </Button>
    </div>
  );
}
