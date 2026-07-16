"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addCredentialAction } from "@/app/actions/project-credentials";
import {
  CREDENTIAL_ENVIRONMENT_OPTIONS, CREDENTIAL_TYPE_OPTIONS, CREDENTIAL_VISIBILITY_OPTIONS,
  credentialSchema, type CredentialInput,
} from "@/lib/validation/project";
import { CredentialEnumSelectField, CredentialTextField } from "./credential-form-fields";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const DEFAULTS: CredentialInput = {
  name: "",
  type: "server_login",
  username: null,
  secret: "",
  related_url: null,
  environment: "prod",
  visibility: "project_members",
  notes: null,
  expires_at: null,
};

// Create-only: there is no edit flow for a saved credential yet (its secret already went into
// Vault and can't be reviewed/changed here -- see credential-form-dialog.tsx's description).
export function CredentialForm({
  projectId,
  onSuccess,
}: {
  projectId: string;
  onSuccess: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<CredentialInput>({
    resolver: zodResolver(credentialSchema),
    defaultValues: DEFAULTS,
  });

  function onSubmit(values: CredentialInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await addCredentialAction(projectId, values);
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
        <CredentialTextField control={form.control} name="name" label="Name" placeholder="e.g. Shop staging DB" nullable={false} />
        <div className="grid grid-cols-2 gap-3">
          <CredentialEnumSelectField control={form.control} name="type" label="Type" options={CREDENTIAL_TYPE_OPTIONS} />
          <CredentialEnumSelectField
            control={form.control}
            name="environment"
            label="Environment"
            options={CREDENTIAL_ENVIRONMENT_OPTIONS}
          />
        </div>
        <CredentialTextField control={form.control} name="username" label="Username" />
        <FormField
          control={form.control}
          name="secret"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Secret</FormLabel>
              <FormControl render={<Input type="password" autoComplete="new-password" {...field} />} />
              <FormMessage />
            </FormItem>
          )}
        />
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
            {isPending ? "Saving…" : "Save credential"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
