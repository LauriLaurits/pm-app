"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { deletePersonAction, setPersonStatusAction } from "@/app/actions/people";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PersonFormDialog } from "./person-form-dialog";
import type { PersonListRow } from "./types";

/** Row actions in the projects-table language: hover-revealed "Open" + a "…" menu. Edit,
 * Deactivate/Activate, and the guarded hard-delete live in the menu (managers only) and open
 * dialogs whose state is lifted here -- the menu closes on click, so the dialogs must mount
 * outside it (same pattern as clients client-row-actions.tsx). The delete action itself refuses
 * (with a friendly error, surfaced inline by ConfirmDialog) whenever the person has assignments
 * or logged time -- see deletePersonAction and the people_prevent_delete_with_history DB
 * trigger, which is the real backstop. */
export function PersonRowActions({
  person,
  canManage,
  roleTitleOptions,
  teamOptions,
}: {
  person: PersonListRow;
  canManage: boolean;
  roleTitleOptions: string[];
  teamOptions: string[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
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
    <>
      {/* Actions surface on row hover (GitHub/Linear style) -- and stay visible while focused
          or while the menu is open, so keyboard users aren't locked out. */}
      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-aria-expanded:opacity-100">
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          render={<Link href={`/people/${person.id}`} />}
        >
          Open
        </Button>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Actions for ${person.full_name}`}
              className="rounded p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleStatus} disabled={isPending}>
                {person.status === "active" ? "Deactivate" : "Activate"}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
      {canManage && (
        <>
          <PersonFormDialog
            person={person}
            roleTitleOptions={roleTitleOptions}
            teamOptions={teamOptions}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title="Permanently delete this person?"
            description={`Permanently delete "${person.full_name}"? This can't be undone. People with assignments or logged time can't be deleted -- deactivate them instead.`}
            confirmLabel="Delete permanently"
            pendingLabel="Deleting…"
            onConfirm={() => deletePersonAction(person.id)}
          />
        </>
      )}
    </>
  );
}
