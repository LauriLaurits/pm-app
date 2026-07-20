"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { postStatusUpdateAction } from "@/app/actions/projects";
import { statusUpdateSchema, type StatusUpdateInput } from "@/lib/validation/project";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";

const FIELDS: { name: keyof StatusUpdateInput; label: string }[] = [
  { name: "completed", label: "Completed" },
  { name: "in_progress", label: "In progress" },
  { name: "blockers", label: "Blockers" },
  { name: "decisions_needed", label: "Decisions needed" },
  { name: "next_milestone", label: "Next milestone" },
  { name: "handover_info", label: "Handover info" },
];

const emptyValues: StatusUpdateInput = {
  completed: null,
  in_progress: null,
  blockers: null,
  decisions_needed: null,
  next_milestone: null,
  handover_info: null,
};

export function StatusUpdateForm({
  projectId,
  onSuccess,
}: {
  projectId: string;
  onSuccess?: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const form = useForm<StatusUpdateInput>({
    resolver: zodResolver(statusUpdateSchema),
    defaultValues: emptyValues,
  });

  function onSubmit(values: StatusUpdateInput) {
    setServerError(null);
    setPosted(false);
    startTransition(async () => {
      const result = await postStatusUpdateAction(projectId, values);
      if ("error" in result) setServerError(result.error);
      else {
        setPosted(true);
        form.reset(emptyValues);
        onSuccess?.();
      }
    });
  }

  return (
    <div>
      <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {serverError && (
              <Alert variant="destructive">
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}
            {posted && (
              <Alert>
                <AlertDescription>Status update posted.</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {FIELDS.map(({ name, label }) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{label}</FormLabel>
                      <FormControl
                        render={<Textarea rows={2} {...field} value={field.value ?? ""} />}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Posting…" : "Post update"}
            </Button>
          </form>
        </Form>
    </div>
  );
}
