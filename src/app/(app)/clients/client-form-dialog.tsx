"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EDIT_ACTION_CLASS } from "@/lib/action-styles";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ClientForm } from "./client-form";
import type { ClientContactRow, ClientRow } from "./types";

/** Add/edit dialog for the /clients screens. Two modes:
 * - Uncontrolled (default): renders its own trigger button + owns open state -- the page-level
 *   "Add client" and the client-detail "Edit" use this.
 * - Controlled (`open`/`onOpenChange` passed): no trigger of its own -- the clients-table row
 *   menu lifts the open state so a DropdownMenuItem can launch it (the menu closes on click,
 *   so the dialog must mount outside it). See client-row-actions.tsx.
 * For the inline "＋ New client…" flow inside the project forms, see
 * client-quick-create-dialog.tsx (same underlying ClientForm, no trigger of its own). */
export function ClientFormDialog({
  client,
  contacts,
  open: controlledOpen,
  onOpenChange,
}: {
  client?: ClientRow;
  contacts?: ClientContactRow[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) onOpenChange?.(next);
    else setUncontrolledOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger
          render={
            <Button size="sm" variant={client ? "ghost" : "default"} className={client ? EDIT_ACTION_CLASS : undefined} />
          }
        >
          {client ? "Edit" : "Add client"}
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{client ? `Edit ${client.name}` : "Add client"}</DialogTitle>
        </DialogHeader>
        <ClientForm client={client} contacts={contacts} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
