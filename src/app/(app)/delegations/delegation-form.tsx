"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createDelegationAction } from "@/app/actions/delegations";
import { createDelegationSchema, type CreateDelegationInput } from "@/lib/validation/delegation";
import { MultiSelectToggle } from "@/components/multi-select-toggle";
import { PersonPickerField } from "./person-picker-field";
import { humanize } from "./types";
import type { PermissionOption, PersonOption, ProjectOption } from "./types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {serverError && (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}
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
        <FormField
          control={form.control}
          name="project_ids"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your projects to cover</FormLabel>
              <MultiSelectToggle
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
                value={field.value}
                onValueChange={field.onChange}
                emptyMessage="You aren't the PM on any project."
                aria-label="Projects to delegate"
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="permission_keys"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Permissions to hand over</FormLabel>
              <MultiSelectToggle
                options={permissions.map((p) => ({ value: p.key, label: humanize(p.key) }))}
                value={field.value}
                onValueChange={field.onChange}
                emptyMessage="No delegatable permissions configured."
                aria-label="Permissions to delegate"
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="starts_at"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Starts</FormLabel>
                <FormControl render={<Input type="date" {...field} />} />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="ends_at"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ends</FormLabel>
                <FormControl render={<Input type="date" {...field} />} />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="handover_notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Handover notes (optional)</FormLabel>
              <FormControl
                render={
                  <Textarea rows={3} placeholder="What should they know?" {...field} value={field.value ?? ""} />
                }
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Creating…" : "Create delegation"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
