"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { LogTimeForm } from "./log-time-form";
import type { AssignedProjectOption, PartOption } from "./types";

export function LogTimeDialog({
  projects,
  partsByProject,
}: {
  projects: AssignedProjectOption[];
  partsByProject: Record<string, PartOption[]>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>Log time</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log time</DialogTitle>
        </DialogHeader>
        <LogTimeForm projects={projects} partsByProject={partsByProject} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
