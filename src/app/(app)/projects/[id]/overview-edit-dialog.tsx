"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { OverviewEditForm } from "./overview-edit-form";
import type { ClientOption, PmOption } from "./overview-edit-admin-fields";
import type { ProjectRow } from "./types";
import { EDIT_ACTION_CLASS } from "@/lib/action-styles";

export function OverviewEditDialog({
  project,
  clients,
  isAdmin,
  pmCandidates,
  currentPmName,
}: {
  project: ProjectRow;
  clients: ClientOption[];
  isAdmin: boolean;
  pmCandidates: PmOption[];
  currentPmName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" className={EDIT_ACTION_CLASS} />}>Edit project</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {project.name}</DialogTitle>
          <DialogDescription>Changes are saved immediately and audited.</DialogDescription>
        </DialogHeader>
        <OverviewEditForm
          project={project}
          clients={clients}
          isAdmin={isAdmin}
          pmCandidates={pmCandidates}
          currentPmName={currentPmName}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
