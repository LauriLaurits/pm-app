"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { upsertPersonAction } from "@/app/actions/people";
import {
  EMPLOYMENT_TYPE_OPTIONS, PERSON_STATUS_OPTIONS, personSchema, type PersonInput,
} from "@/lib/validation/person";
import { PersonEnumSelectField, WeeklyCapacityField } from "./person-form-fields";
import type { PersonListRow } from "./types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

function toDefaults(person?: PersonListRow): PersonInput {
  return {
    full_name: person?.full_name ?? "",
    email: person?.email ?? null,
    role_title: person?.role_title ?? null,
    department: person?.department ?? null,
    employment_type: person?.employment_type ?? "employee",
    weekly_capacity_hours: person?.weekly_capacity_hours ?? 40,
    status: person?.status ?? "active",
  };
}

export function PersonForm({
  person,
  onSuccess,
}: {
  person?: PersonListRow;
  onSuccess: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<PersonInput>({
    resolver: zodResolver(personSchema),
    defaultValues: toDefaults(person),
  });

  function onSubmit(values: PersonInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await upsertPersonAction(values, person?.id);
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
          name="full_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl render={<Input {...field} />} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl render={<Input type="email" {...field} value={field.value ?? ""} />} />
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="role_title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role title</FormLabel>
                <FormControl render={<Input {...field} value={field.value ?? ""} />} />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="department"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Department</FormLabel>
                <FormControl render={<Input {...field} value={field.value ?? ""} />} />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <PersonEnumSelectField
            control={form.control}
            name="employment_type"
            label="Employment type"
            options={EMPLOYMENT_TYPE_OPTIONS}
          />
          <WeeklyCapacityField control={form.control} />
        </div>
        <PersonEnumSelectField control={form.control} name="status" label="Status" options={PERSON_STATUS_OPTIONS} />
        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save person"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
