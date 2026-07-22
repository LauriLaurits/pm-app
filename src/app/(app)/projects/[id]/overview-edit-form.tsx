"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { editProjectAction } from "@/app/actions/projects";
import {
  BUDGET_TYPE_OPTIONS,
  editProjectSchema,
  PROJECT_PRIORITY_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  type EditProjectInput,
  type MilestoneKind,
} from "@/lib/validation/project";
import type { MilestoneRow, ProjectRow } from "./types";
import {
  EnumSelectField, TagsField, TextAreaField, TEXT_FIELDS,
} from "./overview-edit-fields";
import { isBlankMilestone, MilestonesEditor } from "../milestones-editor";
import {
  ClientContactField, ClientField, PmField,
  type ClientContactOption, type ClientOption, type PmOption,
} from "./overview-edit-admin-fields";
import { FormSection } from "@/components/form-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

function toDefaults(project: ProjectRow, milestones: MilestoneRow[]): EditProjectInput {
  return {
    name: project.name,
    client_id: project.client_id,
    client_contact_id: project.client_contact_id,
    description: project.description,
    status: project.status,
    health: project.health,
    priority: project.priority,
    budget_type: project.budget_type,
    // start_date/deadline round-trip unchanged -- the Timeline section edits milestones now,
    // and the DB sync trigger derives both dates from the start/end kinds on save.
    start_date: project.start_date,
    deadline: project.deadline,
    milestones: milestones.map((m) => ({
      name: m.name,
      due_on: m.due_on,
      // DB column is text (check-constrained); the generated type is string.
      kind: m.kind as MilestoneKind,
      done: m.done,
    })),
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
  milestones,
  clients,
  contacts,
  isAdmin,
  pmCandidates,
  currentPmName,
  onSuccess,
}: {
  project: ProjectRow;
  milestones: MilestoneRow[];
  clients: ClientOption[];
  contacts: ClientContactOption[];
  isAdmin: boolean;
  pmCandidates: PmOption[];
  currentPmName: string;
  onSuccess: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<EditProjectInput>({
    resolver: zodResolver(editProjectSchema),
    defaultValues: toDefaults(project, milestones),
  });

  function onSubmit(values: EditProjectInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await editProjectAction(project.id, values);
      if ("error" in result) setServerError(result.error);
      else onSuccess();
    });
  }

  /** Never-touched milestone rows are dropped BEFORE validation runs, so an extra "Add
   * milestone" click never fails "Name is required" on a row the PM never meant to keep. */
  function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    const rows = form.getValues("milestones") ?? [];
    const kept = rows.filter((m) => !isBlankMilestone(m));
    if (kept.length !== rows.length) form.setValue("milestones", kept);
    form.handleSubmit(onSubmit)(e);
  }

  return (
    <Form {...form}>
      <form onSubmit={handleFormSubmit} className="space-y-5">
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <FormSection first tone="blue" title="Details">
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
          <ClientContactField control={form.control} contacts={contacts} />
          <PmField control={form.control} candidates={pmCandidates} isAdmin={isAdmin} currentPmName={currentPmName} />
        </FormSection>

        <FormSection tone="amber" title="Status & priority">
          <div className="grid grid-cols-2 gap-3">
            <EnumSelectField control={form.control} name="status" label="Status" options={PROJECT_STATUS_OPTIONS} />
            <EnumSelectField control={form.control} name="priority" label="Priority" options={PROJECT_PRIORITY_OPTIONS} />
          </div>
        </FormSection>

        <FormSection tone="violet" title="Timeline">
          <MilestonesEditor control={form.control} />
        </FormSection>

        <FormSection tone="teal" title="Tags">
          <TagsField control={form.control} />
        </FormSection>

        <FormSection tone="rose" title="Notes">
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
