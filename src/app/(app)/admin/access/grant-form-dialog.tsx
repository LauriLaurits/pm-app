"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { GrantForm } from "./grant-form";
import type { PermissionOption, ProjectOption, UserOption } from "./types";

/** Self-contained grant-access dialog for /admin/access -- own trigger button, own open state,
 * same shape as DelegationFormDialog/ClientFormDialog elsewhere. Only ever rendered when the page
 * has already determined the viewer holds manage_access (admin-only, see page.tsx). */
export function GrantFormDialog({
  users,
  projects,
  permissions,
}: {
  users: UserOption[];
  projects: ProjectOption[];
  permissions: PermissionOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>Grant access</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Grant project access</DialogTitle>
        </DialogHeader>
        <GrantForm users={users} projects={projects} permissions={permissions} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
