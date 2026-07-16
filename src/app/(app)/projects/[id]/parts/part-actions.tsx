"use client";

import { useState, useTransition } from "react";
import { deletePartAction } from "@/app/actions/project-parts";
import { Button } from "@/components/ui/button";
import type { PartRow } from "./types";

export function PartDeleteButton({ projectId, part }: { projectId: string; part: PartRow }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    if (!window.confirm(`Delete "${part.name}"? This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deletePartAction(projectId, part.id);
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
