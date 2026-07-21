"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createDelegationAction } from "@/app/actions/delegations";
import { createDelegationSchema, type CreateDelegationInput } from "@/lib/validation/delegation";
import { FormSection } from "@/components/form-section";
import { PersonPickerField } from "./person-picker-field";
import { DateRangeFields, NotesField, PermissionsField, ProjectsField } from "./delegation-form-fields";
import type { PermissionOption, PersonOption, ProjectOption } from "./types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const DEFAULTS: CreateDelegationInput = {
  to_user: "",
  project_ids: [],
  permission_keys: [],
  starts_at: todayIso(),
  ends_at: todayIso(),
  handover_notes: null,
};

/** Create-delegation form: `projects` and `permissions` are ALREADY bounded to the caller's own
 * projects and the delegatable=true set (resolved server-side in page.tsx) -- nothing here can
 * even offer a foreign project or a non-delegatable permission to toggle. The DB triggers
 * (enforce_delegatable_permission, validate_delegation_project) remain the real backstop if that
 * boundedness were ever bypassed (e.g. a stale client, a crafted request). */
export function DelegationForm({
  people,
  projects,
  permissions,
  onSuccess,
}: {
  people: PersonOption[];
  projects: ProjectOption[];
  permissions: PermissionOption[];
  onSuccess: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<CreateDelegationInput>({
    resolver: zodResolver(createDelegationSchema),
    defaultValues: DEFAULTS,
  });

  function onSubmit(values: CreateDelegationInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await createDelegationAction(values);
      if ("error" in result) setServerError(result.error);
      else {
        form.reset(DEFAULTS);
        onSuccess();
      }
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

        <FormSection first title="Who covers for you">
          <FormField
            control={form.control}
            name="to_user"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Hand over to</FormLabel>
                <FormControl
                  render={
                    <PersonPickerField value={field.value || null} onChange={field.onChange} options={people} />
                  }
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection title="Which projects">
          <ProjectsField control={form.control} projects={projects} />
        </FormSection>

        <FormSection title="What they can do">
          <PermissionsField control={form.control} permissions={permissions} />
        </FormSection>

        <FormSection title="When">
          <DateRangeFields control={form.control} />
        </FormSection>

        <FormSection title="Handover notes">
          <NotesField control={form.control} />
        </FormSection>

        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating…" : "Create delegation"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
