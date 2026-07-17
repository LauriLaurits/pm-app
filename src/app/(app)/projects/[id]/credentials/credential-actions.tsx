"use client";

import { deleteCredentialAction } from "@/app/actions/project-credentials";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { DisplayCredentialRow } from "./types";

export function CredentialDeleteButton({
  projectId,
  credential,
}: {
  projectId: string;
  credential: DisplayCredentialRow;
}) {
  return (
    <ConfirmDialog
      trigger={<Button size="sm" variant="ghost" />}
      triggerLabel="Delete"
      title="Delete this credential?"
      description={`Delete "${credential.name}"? This can't be undone.`}
      onConfirm={() => deleteCredentialAction(projectId, credential.id)}
    />
  );
}
