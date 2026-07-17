"use client";

import { useState } from "react";
import { UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ManageMembersPanel } from "./manage-members-panel";
import type { CandidateOption } from "./types";

/** Replaces the old one-at-a-time "Add member" dialog. Opens a searchable checklist of every
 * addable person (ManageMembersPanel) where toggling a checkbox on/off adds/removes membership
 * immediately -- adding four people is a few clicks in one panel instead of four dialogs. */
export function ManageMembersDialog({
  projectId,
  candidates,
}: {
  projectId: string;
  candidates: CandidateOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <UsersIcon /> Manage members
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage members</DialogTitle>
          <DialogDescription>
            Toggle people on or off this project. Changes save immediately.
          </DialogDescription>
        </DialogHeader>
        <ManageMembersPanel projectId={projectId} candidates={candidates} />
      </DialogContent>
    </Dialog>
  );
}
