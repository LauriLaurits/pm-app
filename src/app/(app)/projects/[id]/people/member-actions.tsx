"use client";

import { removeProjectPersonAction } from "@/app/actions/project-people";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { MemberRow } from "./types";
import { DESTRUCTIVE_ACTION_CLASS } from "@/lib/action-styles";

export function MemberRemoveButton({ projectId, member }: { projectId: string; member: MemberRow }) {
  const name = member.full_name ?? "this member";
  return (
    <ConfirmDialog
      trigger={<Button size="sm" variant="ghost" className={DESTRUCTIVE_ACTION_CLASS} />}
      triggerLabel="Remove"
      title="Remove this member?"
      description={`Remove ${name} from this project? This clears their access and allocation; they can be re-added later.`}
      confirmLabel="Remove"
      pendingLabel="Removing…"
      onConfirm={() => removeProjectPersonAction(projectId, member.user_id)}
    />
  );
}
