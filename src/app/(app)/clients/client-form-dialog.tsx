"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EDIT_ACTION_CLASS } from "@/lib/action-styles";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ClientForm } from "./client-form";
import type { ClientRow } from "./types";

/** Self-contained add/edit dialog for the /clients screen -- own trigger button, own open
 * state. For the inline "＋ New client…" flow inside the project forms, see
 * client-quick-create-dialog.tsx (same underlying ClientForm, no trigger of its own). */
export function ClientFormDialog({ client }: { client?: ClientRow }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant={client ? "ghost" : "default"} className={client ? EDIT_ACTION_CLASS : undefined} />
        }
      >
        {client ? "Edit" : "Add client"}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{client ? `Edit ${client.name}` : "Add client"}</DialogTitle>
          <DialogDescription>Changes are saved immediately and audited.</DialogDescription>
        </DialogHeader>
        <ClientForm client={client} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
