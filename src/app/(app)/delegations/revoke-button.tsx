"use client";

import { revokeDelegationAction } from "@/app/actions/delegations";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DESTRUCTIVE_ACTION_CLASS } from "@/lib/action-styles";

/** Revoke is instant: has_permission's delegation branch re-evaluates live on every check, so the
 * moment revoked_at is set, the delegate's access is gone -- no separate "propagation" step. */
export function RevokeButton({ delegationId }: { delegationId: string }) {
  return (
    <ConfirmDialog
      trigger={<Button variant="outline" size="sm" className={DESTRUCTIVE_ACTION_CLASS} />}
      triggerLabel="Revoke"
      title="Revoke this delegation?"
      description="The delegate loses this access immediately. This can't be undone -- you'd need to create a new delegation instead."
      confirmLabel="Revoke"
      pendingLabel="Revoking…"
      onConfirm={() => revokeDelegationAction(delegationId)}
    />
  );
}
