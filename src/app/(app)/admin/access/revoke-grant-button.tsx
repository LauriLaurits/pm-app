"use client";

import { revokeProjectAccessAction } from "@/app/actions/access";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

/** Revoke is instant: has_permission's user_project_permissions branch reads the table live, so
 * once this row is deleted the grantee's access is gone on their very next check -- no separate
 * propagation step. */
export function RevokeGrantButton({
  grantId,
  projectId,
  label,
}: {
  grantId: number;
  projectId: string;
  label: string;
}) {
  return (
    <ConfirmDialog
      trigger={<Button variant="outline" size="sm" />}
      triggerLabel="Revoke"
      title="Revoke this access grant?"
      description={`${label} loses this permission on this project immediately.`}
      confirmLabel="Revoke"
      pendingLabel="Revoking…"
      onConfirm={() => revokeProjectAccessAction(grantId, projectId)}
    />
  );
}
