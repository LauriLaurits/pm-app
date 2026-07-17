"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addBudgetItemAction } from "@/app/actions/budget-items";
import {
  BUDGET_ITEM_TYPE_OPTIONS, CLIENT_BUDGET_ITEM_TYPES, budgetItemSchema, type BudgetItemInput,
} from "@/lib/validation/budget";
import { DateField, ItemTypeField, MoneyField } from "./budget-form-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function defaults(): BudgetItemInput {
  return { item_type: "invoice", name: "", amount: 0, occurred_on: todayIso(), note: null };
}

/** Add an invoice/payment/change (or, for finance, a planned/actual cost line) to the project's
 * budget. Backed by addBudgetItemAction, which creates the project-level `budgets` row on first
 * use -- there is no separate "create a budget" step to walk through first. */
export function BudgetItemForm({
  projectId,
  canManageCost,
  onSuccess,
}: {
  projectId: string;
  canManageCost: boolean;
  onSuccess: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<BudgetItemInput>({
    resolver: zodResolver(budgetItemSchema),
    defaultValues: defaults(),
  });

  // A PM (manage_budget, no view_internal_cost) is only ever offered invoice/payment/change --
  // planned_cost/actual_cost never appear in this <Select> for them. The server action
  // re-enforces this regardless (requirePermission('view_internal_cost', ...) for cost types).
  const options = canManageCost ? BUDGET_ITEM_TYPE_OPTIONS : CLIENT_BUDGET_ITEM_TYPES;

  function onSubmit(values: BudgetItemInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await addBudgetItemAction(projectId, values);
      if ("error" in result) setServerError(result.error);
      else {
        form.reset(defaults());
        onSuccess();
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}
        <ItemTypeField control={form.control} name="item_type" options={options} />
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl render={<Input {...field} placeholder="e.g. Milestone 1 invoice" />} />
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <MoneyField control={form.control} name="amount" label="Amount" nullable={false} />
          <DateField control={form.control} name="occurred_on" label="Date" />
        </div>
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note</FormLabel>
              <FormControl render={<Textarea rows={2} {...field} value={field.value ?? ""} />} />
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Add entry"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
