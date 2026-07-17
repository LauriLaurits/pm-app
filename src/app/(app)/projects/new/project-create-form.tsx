"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createProjectAction } from "@/app/actions/projects";
import {
  BUDGET_TYPE_OPTIONS,
  createProjectSchema,
  PROJECT_HEALTH_OPTIONS,
  PROJECT_PRIORITY_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  type CreateProjectInput,
} from "@/lib/validation/project";
import {
  ClientField, DateField, EnumSelectField, TagsField, type ClientOption,
} from "./project-create-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

// Good defaults so a PM can type just a name and hit Create: Planning/Healthy/Medium/Fixed
// are the same "new, low-risk project" baseline the rest of the app already assumes.
const DEFAULT_VALUES: CreateProjectInput = {
  name: "",
  client_id: null,
  description: null,
  status: "planning",
  health: "healthy",
  priority: "medium",
  budget_type: "fixed",
  start_date: null,
  deadline: null,
  tags: [],
};

export function ProjectCreateForm({
  clients,
  currentUserLabel,
}: {
  clients: ClientOption[];
  currentUserLabel: string;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: DEFAULT_VALUES,
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {serverError && (
              <Alert variant="destructive">
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}
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
            <div>
              <p className="mb-1.5 text-sm font-medium">Project manager</p>
              <p className="text-sm text-muted-foreground">You ({currentUserLabel})</p>
            </div>
            <ClientField control={form.control} clients={clients} />
            <div className="grid grid-cols-2 gap-3">
              <EnumSelectField control={form.control} name="status" label="Status" options={PROJECT_STATUS_OPTIONS} />
              <EnumSelectField control={form.control} name="health" label="Health" options={PROJECT_HEALTH_OPTIONS} />
              <EnumSelectField control={form.control} name="priority" label="Priority" options={PROJECT_PRIORITY_OPTIONS} />
              <EnumSelectField control={form.control} name="budget_type" label="Budget type" options={BUDGET_TYPE_OPTIONS} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DateField control={form.control} name="start_date" label="Start date" />
              <DateField control={form.control} name="deadline" label="Deadline" />
            </div>
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
