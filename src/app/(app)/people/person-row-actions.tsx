"use client";

import { useState, useTransition } from "react";
import { deletePersonAction, setPersonStatusAction } from "@/app/actions/people";
import { Button } from "@/components/ui/button";
import { PersonFormDialog } from "./person-form-dialog";
import type { PersonListRow } from "./types";

/** Managers-only row controls: Edit, a status toggle (the primary, non-destructive "remove"),
 * and a guarded hard-delete. The delete action itself refuses (with a friendly error) whenever
 * the person has assignments or logged time -- see deletePersonAction and the
 * people_prevent_delete_with_history DB trigger, which is the real backstop. */
export function PersonRowActions({ person }: { person: PersonListRow }) {
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

  function onDelete() {
    if (!window.confirm(`Permanently delete "${person.full_name}"? This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deletePersonAction(person.id);
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <PersonFormDialog person={person} />
        <Button size="sm" variant="outline" onClick={onToggleStatus} disabled={isPending}>
          {person.status === "active" ? "Deactivate" : "Activate"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete} disabled={isPending}>
          Delete
        </Button>
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
