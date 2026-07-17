"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { BudgetItemForm } from "./budget-item-form";

/** "Add budget entry" -- the only mutation surface for invoices/payments/changes (and, for
 * finance, planned/actual cost lines). Rendered on the Budget tab whenever the caller holds
 * manage_budget; canManageCost further widens the type <Select> inside the form. */
export function BudgetItemFormDialog({
  projectId,
  canManageCost,
}: {
  projectId: string;
  canManageCost: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>Add budget entry</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add budget entry</DialogTitle>
          <DialogDescription>Changes are saved immediately and audited.</DialogDescription>
        </DialogHeader>
        <BudgetItemForm
          projectId={projectId}
          canManageCost={canManageCost}
          onSuccess={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
