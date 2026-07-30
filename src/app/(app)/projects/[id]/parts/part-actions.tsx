"use client";

import { deletePartAction } from "@/app/actions/project-parts";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { SafePartRow } from "./types";
import { DESTRUCTIVE_ACTION_CLASS } from "@/lib/action-styles";

export function PartDeleteButton({ projectId, part }: { projectId: string; part: SafePartRow }) {
  return (
    <ConfirmDialog
      trigger={<Button size="sm" variant="ghost" className={DESTRUCTIVE_ACTION_CLASS} />}
      triggerLabel="Delete"
      title="Delete this part?"
      description={`Delete "${part.name}"? This can't be undone.`}
      onConfirm={() => deletePartAction(projectId, part.id)}
    />
  );
}
