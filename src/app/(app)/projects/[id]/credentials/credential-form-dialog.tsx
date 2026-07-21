"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { EDIT_ACTION_CLASS } from "@/lib/action-styles";
import { CredentialEditForm } from "./credential-edit-form";
import { CredentialForm } from "./credential-form";
import type { DisplayCredentialRow } from "./types";

/** `credential` present -> edit mode (non-secret metadata only, CredentialEditForm); absent ->
 * create mode (CredentialForm, the only place the write-once secret field appears). Same
 * create/edit-reuse pattern as LinkFormDialog. */
export function CredentialFormDialog({
  projectId,
  credential,
}: {
  projectId: string;
  credential?: DisplayCredentialRow;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant={credential ? "ghost" : "default"} className={credential ? EDIT_ACTION_CLASS : undefined} />
        }
      >
        {credential ? "Edit" : "Add credential"}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{credential ? `Edit ${credential.name}` : "Add credential"}</DialogTitle>
          <DialogDescription>
            {credential
              ? "The secret can't be changed here -- it stays write-once. Only the metadata below is editable."
              : "The secret is stored in Vault, never in plain text. It cannot be viewed here or " +
                "edited after saving -- revealing/rotating secrets is coming in a later update."}
          </DialogDescription>
        </DialogHeader>
        {credential ? (
          <CredentialEditForm projectId={projectId} credential={credential} onSuccess={() => setOpen(false)} />
        ) : (
          <CredentialForm projectId={projectId} onSuccess={() => setOpen(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
