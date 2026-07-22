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

/** Add/edit dialog for the /people screens. Two modes (same as ClientFormDialog):
 * - Uncontrolled (default): renders its own trigger button + owns open state -- the page-level
 *   "Add person" uses this.
 * - Controlled (`open`/`onOpenChange` passed): no trigger of its own -- the people-table row
 *   menu lifts the open state so a DropdownMenuItem can launch it (the menu closes on click,
 *   so the dialog must mount outside it). See person-row-actions.tsx. */
export function PersonFormDialog({
  person,
  roleTitleOptions,
  teamOptions,
  triggerClassName,
  open: controlledOpen,
  onOpenChange,
}: {
  person?: PersonListRow;
  roleTitleOptions: string[];
  teamOptions: string[];
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) onOpenChange?.(next);
    else setUncontrolledOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
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
      )}
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
