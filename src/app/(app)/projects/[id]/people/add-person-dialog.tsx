"use client";

import { useState } from "react";
import { UserPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { AddPersonForm } from "./add-person-form";
import type { CandidateOption } from "./types";

// First-add flow: pick a not-yet-added person, set role + period dates, done. Additional
// periods for someone already on the project go through the per-row "Add period" action
// (AddPeriodDialog) instead, which reuses the same form with the person locked.
export function AddPersonDialog({
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
        <UserPlusIcon /> Add person
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a person to this project</DialogTitle>
        </DialogHeader>
        <AddPersonForm
          projectId={projectId}
          candidates={candidates}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
