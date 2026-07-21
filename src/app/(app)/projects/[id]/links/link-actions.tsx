"use client";

import { deleteLinkAction } from "@/app/actions/project-links";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { LinkRow } from "./types";
import { DESTRUCTIVE_ACTION_CLASS } from "@/lib/action-styles";

export function LinkDeleteButton({ projectId, link }: { projectId: string; link: LinkRow }) {
  return (
    <ConfirmDialog
      trigger={<Button size="sm" variant="ghost" className={DESTRUCTIVE_ACTION_CLASS} />}
      triggerLabel="Delete"
      title="Delete this link?"
      description={`Delete "${link.name}"? This can't be undone.`}
      onConfirm={() => deleteLinkAction(projectId, link.id)}
    />
  );
}
