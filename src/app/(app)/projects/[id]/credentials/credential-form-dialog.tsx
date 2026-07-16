"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { CredentialForm } from "./credential-form";

export function CredentialFormDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>Add credential</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add credential</DialogTitle>
          <DialogDescription>
            The secret is stored in Vault, never in plain text. It cannot be viewed here or
            edited after saving -- revealing/rotating secrets is coming in a later update.
          </DialogDescription>
        </DialogHeader>
        <CredentialForm projectId={projectId} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
