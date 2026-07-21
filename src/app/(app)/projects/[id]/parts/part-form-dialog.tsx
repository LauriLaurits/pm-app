"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { EDIT_ACTION_CLASS } from "@/lib/action-styles";
import { PartForm } from "./part-form";
import type { PartRow, PersonOption } from "./types";

export function PartFormDialog({
  projectId,
  people,
  canViewBudget,
  part,
}: {
  projectId: string;
  people: PersonOption[];
  canViewBudget: boolean;
  part?: PartRow;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant={part ? "outline" : "default"} className={part ? EDIT_ACTION_CLASS : undefined} />
        }
      >
        {part ? "Edit" : "Add part"}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{part ? `Edit ${part.name}` : "Add part"}</DialogTitle>
          <DialogDescription>Changes are saved immediately and audited.</DialogDescription>
        </DialogHeader>
        <PartForm
          projectId={projectId}
          people={people}
          canViewBudget={canViewBudget}
          part={part}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
