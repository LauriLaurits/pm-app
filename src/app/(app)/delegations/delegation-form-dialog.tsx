"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { DelegationForm } from "./delegation-form";
import type { PermissionOption, PersonOption, ProjectOption } from "./types";

/** Self-contained create-delegation dialog for /delegations -- own trigger button, own open
 * state, same shape as ClientFormDialog/CredentialFormDialog elsewhere. Only ever rendered when
 * the page has already determined the viewer holds manage_delegations on an owned project. */
export function DelegationFormDialog({
  people,
  projects,
  permissions,
}: {
  people: PersonOption[];
  projects: ProjectOption[];
  permissions: PermissionOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>New delegation</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a delegation</DialogTitle>
          <DialogDescription>
            Hand off some of your own projects to a colleague for a set period — they gain exactly
            the permissions you pick, only for that window.
          </DialogDescription>
        </DialogHeader>
        <DelegationForm
          people={people}
          projects={projects}
          permissions={permissions}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
