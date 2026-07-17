"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { MemberEditForm } from "./member-edit-form";
import type { MemberRow } from "./types";

export function MemberEditDialog({ projectId, member }: { projectId: string; member: MemberRow }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Edit</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {member.full_name ?? "member"}</DialogTitle>
          <DialogDescription>Changes are saved immediately and audited.</DialogDescription>
        </DialogHeader>
        <MemberEditForm projectId={projectId} member={member} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
