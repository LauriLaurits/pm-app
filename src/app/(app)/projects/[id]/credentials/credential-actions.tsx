"use client";

import { deleteCredentialAction } from "@/app/actions/project-credentials";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { SafeCredentialRow } from "./types";
import { DESTRUCTIVE_ACTION_CLASS } from "@/lib/action-styles";

export function CredentialDeleteButton({
  projectId,
  credential,
}: {
  projectId: string;
  credential: SafeCredentialRow;
}) {
  return (
    <ConfirmDialog
      trigger={<Button size="sm" variant="ghost" className={DESTRUCTIVE_ACTION_CLASS} />}
      triggerLabel="Delete"
      title="Delete this credential?"
      description={`Delete "${credential.name}"? This can't be undone.`}
      onConfirm={() => deleteCredentialAction(projectId, credential.id)}
    />
  );
}
