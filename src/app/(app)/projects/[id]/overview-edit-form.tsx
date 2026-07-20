"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { editProjectAction } from "@/app/actions/projects";
import {
  BUDGET_TYPE_OPTIONS,
  editProjectSchema,
  PROJECT_HEALTH_OPTIONS,
  PROJECT_PRIORITY_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  type EditProjectInput,
} from "@/lib/validation/project";
import type { ProjectRow } from "./types";
import {
  DateField, EnumSelectField, ProgressField, TagsField, TextAreaField, TEXT_FIELDS,
} from "./overview-edit-fields";
import { ClientField, PmField, type ClientOption, type PmOption } from "./overview-edit-admin-fields";
import { FormSection } from "@/components/form-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

function toDefaults(project: ProjectRow): EditProjectInput {
  return {
    name: project.name,
    client_id: project.client_id,
    description: project.description,
    status: project.status,
    health: project.health,
    priority: project.priority,
    budget_type: project.budget_type,
    start_date: project.start_date,
    deadline: project.deadline,
    progress: project.progress,
    risks: project.risks,
    blockers: project.blockers,
    next_steps: project.next_steps,
    internal_notes: project.internal_notes,
    client_notes: project.client_notes,
    tags: project.tags,
    pm_id: project.pm_id,
  };
}

export function OverviewEditForm({
  project,
  clients,
  isAdmin,
  pmCandidates,
  currentPmName,
  onSuccess,
}: {
  project: ProjectRow;
  clients: ClientOption[];
  isAdmin: boolean;
  pmCandidates: PmOption[];
  currentPmName: string;
  onSuccess: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<EditProjectInput>({
    resolver: zodResolver(editProjectSchema),
    defaultValues: toDefaults(project),
  });

  function onSubmit(values: EditProjectInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await editProjectAction(project.id, values);
      if ("error" in result) setServerError(result.error);
      else onSuccess();
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <FormSection first title="Details" description="The name, client, and who's running this project.">
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
          <div className="grid grid-cols-2 gap-3">
            <ClientField control={form.control} clients={clients} />
            <EnumSelectField control={form.control} name="budget_type" label="Budget type" options={BUDGET_TYPE_OPTIONS} />
          </div>
          <PmField control={form.control} candidates={pmCandidates} isAdmin={isAdmin} currentPmName={currentPmName} />
        </FormSection>

        <FormSection title="Status & priority" description="How this project is tracking right now.">
          <div className="grid grid-cols-3 gap-3">
            <EnumSelectField control={form.control} name="status" label="Status" options={PROJECT_STATUS_OPTIONS} />
            <EnumSelectField control={form.control} name="health" label="Health" options={PROJECT_HEALTH_OPTIONS} />
            <EnumSelectField control={form.control} name="priority" label="Priority" options={PROJECT_PRIORITY_OPTIONS} />
          </div>
        </FormSection>

        <FormSection title="Timeline & progress" description="Dates and completion, shown on the project overview.">
          <div className="grid grid-cols-3 gap-3">
            <DateField control={form.control} name="start_date" label="Start date" />
            <DateField control={form.control} name="deadline" label="Deadline" />
            <ProgressField control={form.control} />
          </div>
        </FormSection>

        <FormSection title="Tags" description="Used for filtering and grouping on the projects list.">
          <TagsField control={form.control} />
        </FormSection>

        <FormSection title="Notes" description="Free-text context — risks, blockers, next steps, and internal/client notes.">
          {TEXT_FIELDS.map(({ name, label }) => (
            <TextAreaField key={name} control={form.control} name={name} label={label} />
          ))}
        </FormSection>

        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
