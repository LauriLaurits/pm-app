"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { EDIT_ACTION_CLASS } from "@/lib/action-styles";
import { LinkForm } from "./link-form";
import type { LinkRow } from "./types";

export function LinkFormDialog({ projectId, link }: { projectId: string; link?: LinkRow }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant={link ? "ghost" : "default"} className={link ? EDIT_ACTION_CLASS : undefined} />
        }
      >
        {link ? "Edit" : "Add link"}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{link ? `Edit ${link.name}` : "Add link"}</DialogTitle>
        </DialogHeader>
        <LinkForm projectId={projectId} link={link} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
