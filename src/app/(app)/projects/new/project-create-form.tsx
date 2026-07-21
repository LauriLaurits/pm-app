"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createProjectAction } from "@/app/actions/projects";
import {
  BUDGET_TYPE_OPTIONS,
  createProjectSchema,
  PROJECT_STATUS_OPTIONS,
  type CreateProjectInput,
} from "@/lib/validation/project";
import {
  ClientContactField, ClientField, DateField, EnumSelectField, PmField, TagsField,
  type ClientContactOption, type ClientOption, type PmOption,
} from "./project-create-fields";
import { FormSection } from "@/components/form-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

// Good defaults so a PM can type just a name and hit Create: Planning/Healthy/Fixed are the
// same "new, low-risk project" baseline the rest of the app already assumes. Priority isn't
// asked on this form anymore (P3 feedback) -- the schema default ('medium') applies and it
// stays editable on the list/detail views.
const DEFAULT_VALUES: Omit<CreateProjectInput, "pm_id"> = {
  name: "",
  client_id: null,
  client_contact_id: null,
  description: null,
  status: "planning",
  health: "healthy",
  budget_type: "fixed",
  start_date: null,
  deadline: null,
  tags: [],
};

export function ProjectCreateForm({
  clients,
  contacts,
  pms,
  currentUserId,
}: {
  clients: ClientOption[];
  contacts: ClientContactOption[];
  pms: PmOption[];
  currentUserId: string;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { ...DEFAULT_VALUES, pm_id: currentUserId },
  });

  function onSubmit(values: CreateProjectInput) {
    setServerError(null);
    startTransition(async () => {
      // On success the action redirects server-side to the new project's Overview page and
      // this promise never resolves with a value -- only the error path returns here.
      const result = await createProjectAction(values);
      if (result && "error" in result) setServerError(result.error);
    });
  }

  return (
    <Card className="max-w-2xl">
      <CardContent className="pt-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {serverError && (
              <Alert variant="destructive">
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}

            <FormSection first tone="blue" title="Project details">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl render={<Input autoFocus placeholder="e.g. Retail e-shop replatform" {...field} />} />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <PmField control={form.control} pms={pms} />
              <ClientField control={form.control} clients={clients} />
              <ClientContactField control={form.control} contacts={contacts} />
            </FormSection>

            <FormSection tone="amber" title="Status & Budget">
              <div className="grid grid-cols-2 gap-3">
                <EnumSelectField control={form.control} name="status" label="Status" options={PROJECT_STATUS_OPTIONS} />
                <EnumSelectField control={form.control} name="budget_type" label="Budget type" options={BUDGET_TYPE_OPTIONS} />
              </div>
            </FormSection>

            <FormSection tone="violet" title="Timeline">
              <div className="grid grid-cols-2 gap-3">
                <DateField control={form.control} name="start_date" label="Start date" />
                <DateField control={form.control} name="deadline" label="Deadline" />
              </div>
            </FormSection>

            <FormSection tone="teal" title="Tags & description">
              <TagsField control={form.control} />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl render={<Textarea rows={3} {...field} value={field.value ?? ""} />} />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSection>

            <div className="flex justify-end">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Creating…" : "Create project"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
