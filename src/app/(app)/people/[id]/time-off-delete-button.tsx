"use client";

import { useState, useTransition } from "react";
import { deleteTimeOffAction } from "@/app/actions/time-off";
import { Button } from "@/components/ui/button";

export function TimeOffDeleteButton({ personId, timeOffId }: { personId: string; timeOffId: number }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    if (!window.confirm("Delete this time-off period? This cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteTimeOffAction(personId, timeOffId);
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
