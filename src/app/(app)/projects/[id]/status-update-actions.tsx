"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DESTRUCTIVE_ACTION_CLASS, EDIT_ACTION_CLASS } from "@/lib/action-styles";
import { deleteStatusUpdateAction } from "@/app/actions/projects";
import { StatusUpdateForm } from "./status-update-form";
import type { StatusUpdateRow } from "./types";

/** Hover-revealed "…" menu for a single status update, in the projects-table language (same
 * reveal classes as ClientRowActions/PersonRowActions). Rendered as a SIBLING of the accordion
 * trigger for older updates -- never nested inside it -- so opening the menu never toggles the
 * accordion open/closed (see status-history.tsx). Edit and Delete both open dialogs whose state
 * is lifted here (the menu closes on click, so the dialogs must mount outside it). Edit is
 * author-only; Delete is author-or-admin (the admin RLS delete policy is the real backstop for
 * the admin case, same as postStatusUpdateAction's author check is for edit/delete). */
export function StatusUpdateActions({
  projectId,
  update,
  currentUserId,
  isAdmin,
}: {
  projectId: string;
  update: StatusUpdateRow;
  currentUserId: string | null;
  isAdmin: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const canEdit = currentUserId !== null && update.author_id === currentUserId;
  const canDelete = canEdit || isAdmin;

  if (!canEdit && !canDelete) return null;

  return (
    <>
      <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-aria-expanded:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Actions for this status update"
            className="rounded p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canEdit && (
              <DropdownMenuItem className={EDIT_ACTION_CLASS} onClick={() => setEditOpen(true)}>
                Edit update
              </DropdownMenuItem>
            )}
            {canDelete && (
              <DropdownMenuItem className={DESTRUCTIVE_ACTION_CLASS} onClick={() => setDeleteOpen(true)}>
                Delete update
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {canEdit && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit status update</DialogTitle>
            </DialogHeader>
            <StatusUpdateForm projectId={projectId} update={update} onSuccess={() => setEditOpen(false)} />
          </DialogContent>
        </Dialog>
      )}
      {canDelete && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete this status update?"
          description="Delete this status update? This can't be undone."
          confirmLabel="Delete"
          pendingLabel="Deleting…"
          onConfirm={() => deleteStatusUpdateAction(projectId, update.id)}
        />
      )}
    </>
  );
}
