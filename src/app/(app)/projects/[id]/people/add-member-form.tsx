"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addMemberAction } from "@/app/actions/project-members";
import { addMemberSchema, type AddMemberInput } from "@/lib/validation/project";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { PersonOption } from "./types";

export function AddMemberForm({
  projectId,
  candidates,
  onSuccess,
}: {
  projectId: string;
  candidates: PersonOption[];
  onSuccess: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<AddMemberInput>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: { user_id: "", role_on_project: null, starts_on: null, ends_on: null },
  });

  function onSubmit(values: AddMemberInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await addMemberAction(projectId, values);
      if ("error" in result) setServerError(result.error);
      else onSuccess();
    });
  }

  if (candidates.length === 0) {
    return <p className="text-sm text-muted-foreground">Everyone eligible is already a member.</p>;
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
          name="user_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Person</FormLabel>
              <Select value={field.value} onValueChange={(v) => field.onChange(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string) => candidates.find((c) => c.user_id === v)?.full_name ?? "Select a person"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.user_id} value={c.user_id}>{c.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role_on_project"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role on project</FormLabel>
              <FormControl render={<Input {...field} value={field.value ?? ""} placeholder="e.g. backend lead" />} />
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
            {isPending ? "Adding…" : "Add member"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
