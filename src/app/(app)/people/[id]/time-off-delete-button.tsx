"use client";

import { deleteTimeOffAction } from "@/app/actions/time-off";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function TimeOffDeleteButton({ personId, timeOffId }: { personId: string; timeOffId: number }) {
  return (
    <ConfirmDialog
      trigger={<Button size="sm" variant="ghost" />}
      triggerLabel="Delete"
      title="Delete this time-off period?"
      description="This can't be undone."
      onConfirm={() => deleteTimeOffAction(personId, timeOffId)}
    />
  );
}
