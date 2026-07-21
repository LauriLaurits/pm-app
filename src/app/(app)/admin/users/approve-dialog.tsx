"use client";

import { useState, useTransition } from "react";
import { approveUserAction } from "@/app/actions/admin";
import { APP_ROLES } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export function ApproveDialog({
  userId,
  userLabel,
}: {
  userId: string;
  userLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string>("member");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveUserAction({
        userId,
        role: role as (typeof APP_ROLES)[number],
      });
      if ("error" in result) setError(result.error);
      else setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm">Approve</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve {userLabel}</DialogTitle>
        </DialogHeader>
        <Select
          value={role}
          onValueChange={(value) => setRole(value ?? role)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {APP_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {r.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button onClick={onApprove} disabled={isPending}>
            {isPending ? "Approving…" : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
