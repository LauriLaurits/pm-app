"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ProjectCreateForm } from "./new/project-create-form";
import type {
  ClientContactOption,
  ClientOption,
  PmOption,
} from "./new/project-create-fields";

export function ProjectCreateDialog({
  clients,
  contacts,
  pms,
  currentUserId,
}: {
  clients: ClientOption[];
  contacts: ClientContactOption[];
  pms: PmOption[];
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus />
        New project
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <ProjectCreateForm
          clients={clients}
          contacts={contacts}
          pms={pms}
          currentUserId={currentUserId}
        />
      </DialogContent>
    </Dialog>
  );
}
