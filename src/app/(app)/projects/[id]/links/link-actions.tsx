"use client";

import { useState, useTransition } from "react";
import { deleteLinkAction } from "@/app/actions/project-links";
import { Button } from "@/components/ui/button";
import type { LinkRow } from "./types";

export function LinkDeleteButton({ projectId, link }: { projectId: string; link: LinkRow }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    if (!window.confirm(`Delete "${link.name}"? This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteLinkAction(projectId, link.id);
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
