"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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

/** Adds a membership PERIOD: person + role + start/end dates. Used twice -- as the "Add person"
 * first-add form (person picked from `candidates`) and, with `fixedPerson` set, as the
 * "Add period" form on an existing member's row (person locked, only the new period's details
 * are asked). Writes plain project_members rows via addMemberAction; allocation is no longer
 * set from this tab (workload plumbing stays in the DB, untouched here). */
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
      starts_on: null,
      ends_on: null,
    },
  });

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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="starts_on"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Starts</FormLabel>
                <FormControl render={<Input type="date" {...field} value={field.value ?? ""} />} />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="ends_on"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ends</FormLabel>
                <FormControl render={<Input type="date" {...field} value={field.value ?? ""} />} />
                <FormMessage />
              </FormItem>
            )}
          />
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
