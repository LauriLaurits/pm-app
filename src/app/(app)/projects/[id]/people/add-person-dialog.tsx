"use client";

import { useState } from "react";
import { UserPlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { AddPersonForm } from "./add-person-form";
import type { CandidateOption } from "./types";

// One step: pick a person, set their allocation, done. Writes access + allocation together; the
// allocation feeds the Workload view.
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
          <DialogDescription>
            Days per week is how much of their week this project takes (a full week is 5 days) — it drives the workload view.
          </DialogDescription>
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
