"use client";

import { useState, useTransition } from "react";
import { deleteTimeEntryAction } from "@/app/actions/time-entries";
import { Button } from "@/components/ui/button";

export function TimeEntryDeleteButton({ entryId }: { entryId: number }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    if (!window.confirm("Delete this time entry? This cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteTimeEntryAction(entryId);
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <div className="flex items-center gap-1">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button size="sm" variant="ghost" onClick={onDelete} disabled={isPending}>
        {isPending ? "…" : "Delete"}
      </Button>
    </div>
  );
}
