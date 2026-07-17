"use client";

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ClientForm } from "./client-form";

/**
 * Fully-controlled counterpart to ClientFormDialog -- no trigger of its own, because its
 * trigger is the "＋ New client…" item inside the project forms' client <Select> (see
 * project-create-fields.tsx / overview-edit-admin-fields.tsx), not a visible button here.
 * Lets a PM create a client without leaving the project create/edit flow; on save the caller
 * gets the new client's id/name back and selects it immediately.
 */
export function ClientQuickCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (client: { id: string; name: string }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New client</DialogTitle>
          <DialogDescription>Add a client without leaving this form.</DialogDescription>
        </DialogHeader>
        <ClientForm
          onSuccess={(client) => {
            onOpenChange(false);
            onCreated(client);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
