"use client";

import { deletePartAction } from "@/app/actions/project-parts";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { PartRow } from "./types";

export function PartDeleteButton({ projectId, part }: { projectId: string; part: PartRow }) {
  return (
    <ConfirmDialog
      trigger={<Button size="sm" variant="ghost" />}
      triggerLabel="Delete"
      title="Delete this part?"
      description={`Delete "${part.name}"? This can't be undone.`}
      onConfirm={() => deletePartAction(projectId, part.id)}
    />
  );
}
