"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { upsertClientAction } from "@/app/actions/clients";
import { clientSchema, type ClientInput } from "@/lib/validation/client";
import type { ClientRow } from "./types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function toDefaults(client?: ClientRow): ClientInput {
  return {
    name: client?.name ?? "",
    contact_name: client?.contact_name ?? null,
    contact_email: client?.contact_email ?? null,
    phone: client?.phone ?? null,
    notes: client?.notes ?? null,
  };
}

/** Shared form for both the /clients screen (full add/edit dialog) and the inline "＋ New
 * client…" quick-create flow inside the project forms -- `onSuccess` gets the saved client's
 * id/name back so the quick-create caller can select it immediately without a page reload. */
export function ClientForm({
  client,
  onSuccess,
}: {
  client?: ClientRow;
  onSuccess: (client: { id: string; name: string }) => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<ClientInput>({
    resolver: zodResolver(clientSchema),
    defaultValues: toDefaults(client),
  });

  function onSubmit(values: ClientInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await upsertClientAction(values, client?.id);
      if ("error" in result) setServerError(result.error);
      else onSuccess({ id: result.id, name: result.name });
    });
  }

  return (
    <Form {...form}>
      {/* stopPropagation matters here specifically: ClientQuickCreateDialog renders this form
          inline inside the project create/edit forms' own <form> via the client <Select>'s
          "＋ New client…" option. Dialog content is DOM-portaled out to document.body, but
          React still treats it as a descendant of the outer <form> for SYNTHETIC event
          bubbling purposes (portals bubble through the React tree, not the DOM tree) -- so
          without this, submitting this inner form also re-triggers the outer project form's
          onSubmit (and a real, unwanted project.create), even though the two <form> elements
          are unrelated in the physical DOM. Standalone usage (ClientFormDialog on /clients,
          never nested in another form) is unaffected by this. */}
      <form
        onSubmit={(e) => {
          e.stopPropagation();
          form.handleSubmit(onSubmit)(e);
        }}
        className="space-y-4"
      >
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
              <FormControl render={<Input autoFocus {...field} />} />
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="contact_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact name</FormLabel>
                <FormControl render={<Input {...field} value={field.value ?? ""} />} />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="contact_email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact email</FormLabel>
                <FormControl render={<Input type="email" {...field} value={field.value ?? ""} />} />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl render={<Input {...field} value={field.value ?? ""} />} />
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
              <FormControl render={<Textarea rows={3} {...field} value={field.value ?? ""} />} />
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save client"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
