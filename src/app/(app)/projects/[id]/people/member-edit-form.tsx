"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateMemberAction } from "@/app/actions/project-members";
import { updateMemberSchema, type UpdateMemberInput } from "@/lib/validation/project";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { MemberRow } from "./types";

function toDefaults(member: MemberRow): UpdateMemberInput {
  return {
    role_on_project: member.role_on_project,
    starts_on: member.starts_on,
    ends_on: member.ends_on,
  };
}

/** Edits an existing membership's role/date range only -- which person it belongs to is fixed
 * (remove-and-re-add is the path for that), so there's no person picker here at all. */
export function MemberEditForm({
  projectId,
  member,
  onSuccess,
}: {
  projectId: string;
  member: MemberRow;
  onSuccess: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<UpdateMemberInput>({
    resolver: zodResolver(updateMemberSchema),
    defaultValues: toDefaults(member),
  });

  function onSubmit(values: UpdateMemberInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await updateMemberAction(projectId, member.id, values);
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
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
