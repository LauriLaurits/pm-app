"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { OverviewEditForm } from "./overview-edit-form";
import type { ProjectRow } from "./types";

export function OverviewEditDialog({ project }: { project: ProjectRow }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Edit project</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {project.name}</DialogTitle>
          <DialogDescription>Changes are saved immediately and audited.</DialogDescription>
        </DialogHeader>
        <OverviewEditForm project={project} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
