"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { MemberEditForm } from "./member-edit-form";
import type { MemberRow } from "./types";
import { EDIT_ACTION_CLASS } from "@/lib/action-styles";

export function MemberEditDialog({ projectId, member }: { projectId: string; member: MemberRow }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="ghost" className={EDIT_ACTION_CLASS} />}>Edit</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {member.full_name ?? "member"}</DialogTitle>
        </DialogHeader>
        <MemberEditForm projectId={projectId} member={member} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
