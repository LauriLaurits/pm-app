"use client";

import { deleteTimeEntryAction } from "@/app/actions/time-entries";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function TimeEntryDeleteButton({ entryId }: { entryId: number }) {
  return (
    <ConfirmDialog
      trigger={<Button size="sm" variant="ghost" />}
      triggerLabel="Delete"
      title="Delete this time entry?"
      description="This can't be undone."
      onConfirm={() => deleteTimeEntryAction(entryId)}
    />
  );
}
