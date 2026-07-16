"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { upsertPartAction } from "@/app/actions/project-parts";
import {
  BILLING_MODEL_OPTIONS, PART_STATUS_OPTIONS, partSchema, type PartInput,
} from "@/lib/validation/project";
import type { PartRow, PersonOption } from "./types";
import {
  DateField, EnumSelectField, NumberField, ResponsiblePersonField,
} from "./part-form-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function toDefaults(part?: PartRow): PartInput {
  return {
    name: part?.name ?? "",
    description: part?.description ?? null,
    status: part?.status ?? "not_started",
    responsible_person_id: part?.responsible_person_id ?? null,
    billing_model: part?.billing_model ?? "fixed",
    estimated_hours: part?.estimated_hours ?? null,
    progress: part?.progress ?? 0,
    start_date: part?.start_date ?? null,
    end_date: part?.end_date ?? null,
    notes: part?.notes ?? null,
    client_price: part?.part_billing?.client_price ?? null,
    fixed_amount: part?.part_billing?.fixed_amount ?? null,
    hourly_rate: part?.part_billing?.hourly_rate ?? null,
  };
}

export function PartForm({
  projectId,
  people,
  canViewBudget,
  part,
  onSuccess,
}: {
  projectId: string;
  people: PersonOption[];
  canViewBudget: boolean;
  part?: PartRow;
  onSuccess: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<PartInput>({
    resolver: zodResolver(partSchema),
    defaultValues: toDefaults(part),
  });

  function onSubmit(values: PartInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await upsertPartAction(projectId, values, part?.id);
      if ("error" in result) setServerError(result.error);
      else onSuccess();
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
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl render={<Input {...field} />} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl render={<Textarea rows={2} {...field} value={field.value ?? ""} />} />
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <EnumSelectField control={form.control} name="status" label="Status" options={PART_STATUS_OPTIONS} />
          <EnumSelectField control={form.control} name="billing_model" label="Billing model" options={BILLING_MODEL_OPTIONS} />
        </div>
        <ResponsiblePersonField control={form.control} people={people} />
        <div className="grid grid-cols-2 gap-3">
          <NumberField control={form.control} name="estimated_hours" label="Est. hours" />
          <NumberField control={form.control} name="progress" label="Progress %" nullable={false} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <DateField control={form.control} name="start_date" label="Start date" />
          <DateField control={form.control} name="end_date" label="End date" />
        </div>
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl render={<Textarea rows={2} {...field} value={field.value ?? ""} />} />
              <FormMessage />
            </FormItem>
          )}
        />
        {/* Client price / rate: only rendered for a view_budget holder. A caller without
            it never sees or submits these fields; the action re-checks server-side too. */}
        {canViewBudget && (
          <div className="grid grid-cols-3 gap-3 rounded-lg border p-3">
            <NumberField control={form.control} name="client_price" label="Client price" />
            <NumberField control={form.control} name="fixed_amount" label="Fixed amount" />
            <NumberField control={form.control} name="hourly_rate" label="Hourly rate" />
          </div>
        )}
        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save part"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
