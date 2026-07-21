"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { LogTimeForm } from "./log-time-form";
import type { AssignedProjectOption, PartOption, TimeEntryWithProject } from "./types";
import { EDIT_ACTION_CLASS } from "@/lib/action-styles";

export function TimeEntryEditDialog({
  entry,
  projects,
  partsByProject,
}: {
  entry: TimeEntryWithProject;
  projects: AssignedProjectOption[];
  partsByProject: Record<string, PartOption[]>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="ghost" className={EDIT_ACTION_CLASS} />}>Edit</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit time entry</DialogTitle>
          <DialogDescription>Changes are saved immediately and audited.</DialogDescription>
        </DialogHeader>
        <LogTimeForm projects={projects} partsByProject={partsByProject} entry={entry} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
