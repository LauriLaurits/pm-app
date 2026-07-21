"use client";

import { useState, useTransition } from "react";
import { deletePersonAction, setPersonStatusAction } from "@/app/actions/people";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PersonFormDialog } from "./person-form-dialog";
import type { PersonListRow } from "./types";
import { DESTRUCTIVE_ACTION_CLASS, NEUTRAL_ACTION_CLASS } from "@/lib/action-styles";
import { cn } from "@/lib/utils";

// Client feedback round 1: row actions read too heavy at table density -- shrink to xs pills
// (pastel action classes stay).
const ROW_ACTION_SIZE_CLASS = "h-7 px-2 text-xs";

/** Managers-only row controls: Edit, a status toggle (the primary, non-destructive "remove"),
 * and a guarded hard-delete. The delete action itself refuses (with a friendly error) whenever
 * the person has assignments or logged time -- see deletePersonAction and the
 * people_prevent_delete_with_history DB trigger, which is the real backstop. */
export function PersonRowActions({
  person,
  roleTitleOptions,
  teamOptions,
}: {
  person: PersonListRow;
  roleTitleOptions: string[];
  teamOptions: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onToggleStatus() {
    setError(null);
    const next = person.status === "active" ? "inactive" : "active";
    startTransition(async () => {
      const result = await setPersonStatusAction(person.id, next);
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <PersonFormDialog
          person={person}
          roleTitleOptions={roleTitleOptions}
          teamOptions={teamOptions}
          triggerClassName={ROW_ACTION_SIZE_CLASS}
        />
        <Button
          size="sm"
          variant="ghost"
          className={cn(ROW_ACTION_SIZE_CLASS, NEUTRAL_ACTION_CLASS)}
          onClick={onToggleStatus}
          disabled={isPending}
        >
          {person.status === "active" ? "Deactivate" : "Activate"}
        </Button>
        <ConfirmDialog
          trigger={
            <Button
              size="sm"
              variant="ghost"
              className={cn(ROW_ACTION_SIZE_CLASS, DESTRUCTIVE_ACTION_CLASS)}
            />
          }
          triggerLabel="Delete"
          title="Permanently delete this person?"
          description={`Permanently delete "${person.full_name}"? This can't be undone. People with assignments or logged time can't be deleted -- deactivate them instead.`}
          confirmLabel="Delete permanently"
          pendingLabel="Deleting…"
          onConfirm={() => deletePersonAction(person.id)}
        />
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
