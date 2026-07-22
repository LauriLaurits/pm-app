"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { NEUTRAL_ACTION_CLASS } from "@/lib/action-styles";
import { AddPersonForm } from "./add-person-form";
import type { MemberRow } from "./types";

/** "Add period" on an existing member's row -- a developer who left can come back ("arendaja
 * tuleb ja läheb"), so this opens the same add form as "Add person" with the person locked to
 * this row's member and only the new period's role/dates left to fill in. */
export function AddPeriodDialog({ projectId, member }: { projectId: string; member: MemberRow }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="ghost" className={NEUTRAL_ACTION_CLASS} />}>
        Add period
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a period for {member.full_name ?? "this member"}</DialogTitle>
        </DialogHeader>
        <AddPersonForm
          projectId={projectId}
          candidates={[]}
          fixedPerson={{ user_id: member.user_id, full_name: member.full_name ?? "this member" }}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
