"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { partBillingSchema, partCostsSchema } from "@/lib/validation/budget";
import { upsertPartBillingAction, upsertPartCostsAction } from "@/app/actions/project-budget";
import type { PartBudgetRow } from "./types";
import { MoneyField } from "./budget-form-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { EDIT_ACTION_CLASS } from "@/lib/action-styles";

// Combined client form only -- each section is submitted through its own server action
// (upsertPartBillingAction / upsertPartCostsAction), matching the DB's own table split
// (part_billing vs part_costs) and their separate RLS gates (manage_budget vs
// view_internal_cost + manage_budget). Merging the two zod object schemas here is purely for
// one <Form> instance; nothing about validation is shared beyond that.
const formSchema = partBillingSchema.merge(partCostsSchema);
type FormValues = z.input<typeof formSchema>;

/** Per-part billing/cost editor on the Budget tab -- the dedicated write surface finance needs,
 * since it is gated purely on manage_budget/view_internal_cost, never edit_project (which
 * finance does not hold). Renders nothing if the caller holds neither permission. */
export function PartBudgetEditDialog({
  projectId,
  part,
  canManageBudget,
  canManageCost,
}: {
  projectId: string;
  part: PartBudgetRow;
  canManageBudget: boolean;
  canManageCost: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      client_price: part.client_price,
      fixed_amount: part.fixed_amount,
      hourly_rate: part.hourly_rate,
      planned_internal_cost: part.planned_internal_cost,
      actual_internal_cost: part.actual_internal_cost,
    },
  });

  // part_budget_rows is a view, so every column (including part_id) is typed nullable by the
  // generator even though it's always populated in practice -- this row only ever exists here
  // because a caller who could see the part's project_parts row got it back from the view.
  if (!canManageBudget && !canManageCost) return null;
  if (!part.part_id) return null;
  const partId: string = part.part_id;

  function onSubmit(values: FormValues) {
    setServerError(null);
    startTransition(async () => {
      if (canManageBudget) {
        const billingResult = await upsertPartBillingAction(projectId, partId, {
          client_price: values.client_price,
          fixed_amount: values.fixed_amount,
          hourly_rate: values.hourly_rate,
        });
        if ("error" in billingResult) {
          setServerError(billingResult.error);
          return;
        }
      }
      if (canManageCost) {
        const costResult = await upsertPartCostsAction(projectId, partId, {
          planned_internal_cost: values.planned_internal_cost,
          actual_internal_cost: values.actual_internal_cost,
        });
        if ("error" in costResult) {
          setServerError(costResult.error);
          return;
        }
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" className={EDIT_ACTION_CLASS} />}>Edit billing</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit billing — {part.part_name}</DialogTitle>
          <DialogDescription>Changes are saved immediately and audited.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {serverError && (
              <Alert variant="destructive">
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}
            {canManageBudget && (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-xs font-medium text-muted-foreground">Client billing</p>
                <div className="grid grid-cols-3 gap-3">
                  <MoneyField control={form.control} name="client_price" label="Client price" />
                  <MoneyField control={form.control} name="fixed_amount" label="Fixed amount" />
                  <MoneyField control={form.control} name="hourly_rate" label="Hourly rate" />
                </div>
              </div>
            )}
            {/* Internal cost -- only ever rendered for a view_internal_cost holder (finance). A
                PM never sees these inputs even though they may hold manage_budget. */}
            {canManageCost && (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-xs font-medium text-muted-foreground">Internal cost (finance only)</p>
                <div className="grid grid-cols-2 gap-3">
                  <MoneyField control={form.control} name="planned_internal_cost" label="Planned cost" />
                  <MoneyField control={form.control} name="actual_internal_cost" label="Actual cost" />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
