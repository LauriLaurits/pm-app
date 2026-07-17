"use client";

import { removeMemberAction } from "@/app/actions/project-members";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { MemberRow } from "./types";

export function MemberRemoveButton({ projectId, member }: { projectId: string; member: MemberRow }) {
  const name = member.full_name ?? "this member";
  return (
    <ConfirmDialog
      trigger={<Button size="sm" variant="ghost" />}
      triggerLabel="Remove"
      title="Remove this member?"
      description={`Remove ${name} from this project? They can be re-added later.`}
      confirmLabel="Remove"
      pendingLabel="Removing…"
      onConfirm={() => removeMemberAction(projectId, member.id)}
    />
  );
}
