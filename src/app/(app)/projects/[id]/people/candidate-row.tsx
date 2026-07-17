"use client";

import { useState, useTransition } from "react";
import { addMemberAction, removeMemberAction } from "@/app/actions/project-members";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { initials } from "../../types";
import type { CandidateOption } from "./types";

/** One row in the Manage members panel: a checkbox whose checked state IS project membership.
 * Toggling calls addMemberAction/removeMemberAction directly -- no intermediate form, no dialog
 * per person. New members are added with no role/dates set; those stay editable afterwards via
 * the existing per-row "Edit" control on the People tab's table. */
export function CandidateRow({
  projectId,
  candidate,
}: {
  projectId: string;
  candidate: CandidateOption;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const checked = candidate.memberId !== null;
  const inputId = `member-toggle-${candidate.user_id}`;

  function toggle(next: boolean) {
    setError(null);
    startTransition(async () => {
      const result = next
        ? await addMemberAction(projectId, {
            user_id: candidate.user_id,
            role_on_project: null,
            starts_on: null,
            ends_on: null,
          })
        : candidate.memberId
          ? await removeMemberAction(projectId, candidate.memberId)
          : { error: "Not a member." };
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/50">
      <Checkbox
        id={inputId}
        checked={checked}
        onCheckedChange={(v) => toggle(v === true)}
        disabled={isPending}
      />
      <Avatar size="sm">
        <AvatarImage src={candidate.avatar_url ?? undefined} alt={candidate.full_name} />
        <AvatarFallback>{initials(candidate.full_name)}</AvatarFallback>
      </Avatar>
      <Label htmlFor={inputId} className="flex-1 cursor-pointer text-sm font-normal">
        {candidate.full_name}
      </Label>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
