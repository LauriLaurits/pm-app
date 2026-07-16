"use client";

import { useState, useTransition } from "react";
import { removeMemberAction } from "@/app/actions/project-members";
import { Button } from "@/components/ui/button";
import type { MemberRow } from "./types";

export function MemberRemoveButton({ projectId, member }: { projectId: string; member: MemberRow }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onRemove() {
    const name = member.full_name ?? "this member";
    if (!window.confirm(`Remove ${name} from this project?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await removeMemberAction(projectId, member.id);
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button size="sm" variant="ghost" onClick={onRemove} disabled={isPending}>
        {isPending ? "Removing…" : "Remove"}
      </Button>
    </div>
  );
}
