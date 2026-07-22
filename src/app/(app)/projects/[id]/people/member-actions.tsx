"use client";

import { removeMemberAction } from "@/app/actions/project-members";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { MemberRow } from "./types";
import { DESTRUCTIVE_ACTION_CLASS } from "@/lib/action-styles";

/** Removes ONE membership period (this row), not the person's whole history on the project --
 * removeMemberAction takes the project_members row id, so other periods stay untouched. Any
 * allocation (assignments) is deliberately left alone: workload plumbing stays in the DB but
 * is no longer written from this tab. */
export function MemberRemoveButton({ projectId, member }: { projectId: string; member: MemberRow }) {
  const name = member.full_name ?? "this member";
  return (
    <ConfirmDialog
      trigger={<Button size="sm" variant="ghost" className={DESTRUCTIVE_ACTION_CLASS} />}
      triggerLabel="Remove"
      title="Remove this period?"
      description={`Remove this membership period for ${name}? Other periods they have on this project stay; they can be re-added later.`}
      confirmLabel="Remove"
      pendingLabel="Removing…"
      onConfirm={() => removeMemberAction(projectId, member.id)}
    />
  );
}
