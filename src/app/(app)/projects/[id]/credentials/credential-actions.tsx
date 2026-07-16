"use client";

import { useState, useTransition } from "react";
import { deleteCredentialAction } from "@/app/actions/project-credentials";
import { Button } from "@/components/ui/button";
import type { DisplayCredentialRow } from "./types";

export function CredentialDeleteButton({
  projectId,
  credential,
}: {
  projectId: string;
  credential: DisplayCredentialRow;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    if (!window.confirm(`Delete "${credential.name}"? This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteCredentialAction(projectId, credential.id);
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
