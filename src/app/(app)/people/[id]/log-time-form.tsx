"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { logTimeAction } from "@/app/actions/time-entries";
import { timeEntrySchema, type TimeEntryInput } from "@/lib/validation/time-entry";
import type { AssignedProjectOption, PartOption } from "./types";
import { BillableField, HoursDateFields, PartField, ProjectField } from "./log-time-form-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function defaults(projectId: string): TimeEntryInput {
  return {
    project_id: projectId,
    project_part_id: null,
    entry_date: todayIso(),
    hours: 1,
    billable: true,
    description: null,
  };
}

/** Log-time form -- only ever rendered on the VIEWING user's own person page (see page.tsx).
 * `projects`/`partsByProject` are the caller's own assigned projects/parts, resolved server-side
 * so the picker cannot even offer a project they're not assigned to; the RLS "log own time"
 * policy is the real backstop either way (see logTimeAction). person_id is never part of this
 * form -- it's derived server-side from the caller's own `people` row. */
export function LogTimeForm({
  projects,
  partsByProject,
  onSuccess,
}: {
  projects: AssignedProjectOption[];
  partsByProject: Record<string, PartOption[]>;
  onSuccess: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<TimeEntryInput>({
    resolver: zodResolver(timeEntrySchema),
    defaultValues: defaults(projects[0]?.id ?? ""),
  });
  // useWatch (not form.watch -- React Compiler flags the latter as unmemoizable) must run
  // unconditionally, before the early return below, per rules of hooks.
  const selectedProjectId = useWatch({ control: form.control, name: "project_id" });

  if (projects.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You aren&apos;t assigned to any projects yet — ask your PM to add you before logging
        time.
      </p>
    );
  }

  const parts = partsByProject[selectedProjectId] ?? [];

  function onSubmit(values: TimeEntryInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await logTimeAction(values);
      if ("error" in result) setServerError(result.error);
      else {
        form.reset(defaults(values.project_id));
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
        <ProjectField
          control={form.control}
          projects={projects}
          onProjectChange={() => form.setValue("project_part_id", null)}
        />
        <PartField control={form.control} parts={parts} />
        <HoursDateFields control={form.control} />
        <BillableField control={form.control} />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (optional)</FormLabel>
              <FormControl render={<Textarea rows={2} {...field} value={field.value ?? ""} />} />
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Logging…" : "Log time"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
