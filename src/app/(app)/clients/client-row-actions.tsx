"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteClientAction } from "@/app/actions/clients";
import { ClientFormDialog } from "./client-form-dialog";
import type { ClientListRow } from "./types";

/** Row actions in the projects-table language: hover-revealed "Open" + a "…" menu. Edit and the
 * guarded hard-delete live in the menu (managers only) and open dialogs whose state is lifted
 * here -- the menu closes on click, so the dialogs must mount outside it. The delete action
 * itself refuses (with a friendly error, surfaced inline by ConfirmDialog) whenever the client
 * still has projects referencing it -- see deleteClientAction and the `projects.client_id` FK,
 * which is the real backstop. */
export function ClientRowActions({
  client,
  canManage,
}: {
  client: ClientListRow;
  canManage: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      {/* Actions surface on row hover (GitHub/Linear style) -- and stay visible while focused
          or while the menu is open, so keyboard users aren't locked out. */}
      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-aria-expanded:opacity-100">
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          render={<Link href={`/clients/${client.id}`} />}
        >
          Open
        </Button>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Actions for ${client.name}`}
              className="rounded p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {canManage && (
        <>
          <ClientFormDialog
            client={client}
            contacts={client.contacts}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title="Delete this client?"
            description={`Delete "${client.name}"? This can't be undone. Clients with projects can't be deleted -- reassign or archive those projects first.`}
            confirmLabel="Delete"
            pendingLabel="Deleting…"
            onConfirm={() => deleteClientAction(client.id)}
          />
        </>
      )}
    </>
  );
}
