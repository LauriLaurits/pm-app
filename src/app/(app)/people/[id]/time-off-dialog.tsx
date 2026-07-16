"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { TimeOffForm } from "./time-off-form";
import type { TimeOffRow } from "./types";

/** Doubles as "add" (no `timeOff`) and "edit" (`timeOff` set) -- same trigger/dialog shell as
 * PersonFormDialog on the People list page. */
export function TimeOffDialog({ personId, timeOff }: { personId: string; timeOff?: TimeOffRow }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant={timeOff ? "ghost" : "outline"} />}>
        {timeOff ? "Edit" : "Add time off"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{timeOff ? "Edit time off" : "Add time off"}</DialogTitle>
          <DialogDescription>Changes are saved immediately and audited.</DialogDescription>
        </DialogHeader>
        <TimeOffForm personId={personId} timeOff={timeOff} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
