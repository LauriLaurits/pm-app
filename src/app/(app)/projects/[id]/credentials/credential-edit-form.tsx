"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateCredentialAction } from "@/app/actions/project-credentials";
import {
  CREDENTIAL_ENVIRONMENT_OPTIONS, CREDENTIAL_VISIBILITY_OPTIONS,
  credentialUpdateSchema, type CredentialUpdateInput,
} from "@/lib/validation/project";
import { CredentialEnumSelectField, CredentialTextField } from "./credential-form-fields";
import type { DisplayCredentialRow } from "./types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function toDefaults(credential: DisplayCredentialRow): CredentialUpdateInput {
  return {
    name: credential.name,
    username: credential.username,
    related_url: credential.related_url,
    environment: credential.environment,
    visibility: credential.visibility,
    notes: credential.notes,
    expires_at: credential.expires_at ? credential.expires_at.slice(0, 10) : null,
  };
}

/** Edits only non-secret metadata -- the secret stays write-once (see credential-form.tsx,
 * used only for create). No `type` field either: not part of what this edit surface covers. */
export function CredentialEditForm({
  projectId,
  credential,
  onSuccess,
}: {
  projectId: string;
  credential: DisplayCredentialRow;
  onSuccess: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<CredentialUpdateInput>({
    resolver: zodResolver(credentialUpdateSchema),
    defaultValues: toDefaults(credential),
  });

  function onSubmit(values: CredentialUpdateInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await updateCredentialAction(projectId, credential.id, values);
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
        <CredentialTextField control={form.control} name="name" label="Name" nullable={false} />
        <div className="grid grid-cols-2 gap-3">
          <CredentialTextField control={form.control} name="username" label="Username" />
          <CredentialEnumSelectField
            control={form.control}
            name="environment"
            label="Environment"
            options={CREDENTIAL_ENVIRONMENT_OPTIONS}
          />
        </div>
        <CredentialEnumSelectField
          control={form.control}
          name="visibility"
          label="Visibility"
          options={CREDENTIAL_VISIBILITY_OPTIONS}
        />
        <CredentialTextField control={form.control} name="related_url" label="Related URL" placeholder="https://…" />
        <FormField
          control={form.control}
          name="expires_at"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Expires</FormLabel>
              <FormControl render={<Input type="date" {...field} value={field.value ?? ""} />} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl render={<Textarea rows={2} {...field} value={field.value ?? ""} />} />
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
