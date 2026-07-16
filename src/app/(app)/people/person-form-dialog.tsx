"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { PersonForm } from "./person-form";
import type { PersonListRow } from "./types";

export function PersonFormDialog({ person }: { person?: PersonListRow }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant={person ? "outline" : "default"} />}>
        {person ? "Edit" : "Add person"}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{person ? `Edit ${person.full_name}` : "Add person"}</DialogTitle>
          <DialogDescription>Changes are saved immediately and audited.</DialogDescription>
        </DialogHeader>
        <PersonForm person={person} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
