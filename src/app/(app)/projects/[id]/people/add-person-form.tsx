"use client";

import { useState, useTransition } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, XIcon } from "lucide-react";
import { addMemberAction } from "@/app/actions/project-members";
import { addMemberSchema, type AddMemberInput } from "@/lib/validation/project";
import type { CandidateOption } from "./types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

/** Adds one or more membership periods: person + role + repeatable start/end date ranges.
 * Used twice -- as the "Add person" first-add form (person picked from `candidates`) and, with
 * `fixedPerson` set, as the "Add period" form on an existing member's row (person locked, only
 * new period details are asked). Each row in the periods array becomes its own project_members row;
 * allocation is no longer set from this tab (workload plumbing stays in the DB, untouched here). */
export function AddPersonForm({
  projectId,
  candidates,
  fixedPerson,
  onSuccess,
}: {
  projectId: string;
  candidates: CandidateOption[];
  fixedPerson?: { user_id: string; full_name: string };
  onSuccess: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<AddMemberInput>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: {
      user_id: fixedPerson?.user_id ?? "",
      role_on_project: null,
      periods: [{ starts_on: null, ends_on: null }],
    },
  });

  const periodRows = useFieldArray({ control: form.control, name: "periods" });

  function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    const periods = form.getValues("periods") ?? [];
    const kept = periods.filter((p) => p.starts_on || p.ends_on);
    form.setValue("periods", kept.length > 0 ? kept : [{ starts_on: null, ends_on: null }]);
    form.handleSubmit(onSubmit)(e);
  }

  function onSubmit(values: AddMemberInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await addMemberAction(projectId, values);
      if ("error" in result) setServerError(result.error);
      else onSuccess();
    });
  }

  if (!fixedPerson && candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Everyone with an account is already on this project.
      </p>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={handleFormSubmit} className="space-y-4">
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        {!fixedPerson && (
          <FormField
            control={form.control}
            name="user_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Person</FormLabel>
                <Select value={field.value} onValueChange={(v) => field.onChange(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a person">
                      {(v: string) => candidates.find((c) => c.user_id === v)?.full_name ?? "Select a person"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((c) => (
                      <SelectItem key={c.user_id} value={c.user_id}>
                        {c.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="role_on_project"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <FormControl
                render={<Input placeholder="e.g. Backend" {...field} value={field.value ?? ""} />}
              />
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-2">
          <FormLabel>Periods</FormLabel>
          {periodRows.fields.map((row, i) => (
            <div key={row.id} className="flex items-start gap-2">
              <FormField
                control={form.control}
                name={`periods.${i}.starts_on`}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl
                      render={
                        <Input type="date" aria-label={`Period ${i + 1} start`} {...field} value={field.value ?? ""} />
                      }
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`periods.${i}.ends_on`}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl
                      render={
                        <Input type="date" aria-label={`Period ${i + 1} end`} {...field} value={field.value ?? ""} />
                      }
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              {periodRows.fields.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove period ${i + 1}`}
                  onClick={() => periodRows.remove(i)}
                >
                  <XIcon />
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => periodRows.append({ starts_on: null, ends_on: null })}
          >
            <PlusIcon /> Add period
          </Button>
        </div>

        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Adding…" : fixedPerson ? "Add period" : "Add to project"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
