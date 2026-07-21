"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { EDIT_ACTION_CLASS } from "@/lib/action-styles";
import { cn } from "@/lib/utils";
import { PersonForm } from "./person-form";
import type { PersonListRow } from "./types";

export function PersonFormDialog({
  person,
  roleTitleOptions,
  teamOptions,
  triggerClassName,
}: {
  person?: PersonListRow;
  roleTitleOptions: string[];
  teamOptions: string[];
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            variant={person ? "ghost" : "default"}
            className={person ? cn(EDIT_ACTION_CLASS, triggerClassName) : triggerClassName}
          />
        }
      >
        {person ? "Edit" : "Add person"}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{person ? `Edit ${person.full_name}` : "Add person"}</DialogTitle>
        </DialogHeader>
        <PersonForm
          person={person}
          roleTitleOptions={roleTitleOptions}
          teamOptions={teamOptions}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
