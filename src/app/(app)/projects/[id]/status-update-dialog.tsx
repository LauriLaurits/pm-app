"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { StatusUpdateForm } from "./status-update-form";

// The status form used to sit permanently open at the top of the overview, taking half the page
// for something a PM does once a week. It's now behind a button; the latest update stays visible
// as the card's body.
export function StatusUpdateDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Post update</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Post a status update</DialogTitle>
        </DialogHeader>
        <StatusUpdateForm projectId={projectId} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
