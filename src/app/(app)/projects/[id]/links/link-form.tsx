"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { upsertLinkAction } from "@/app/actions/project-links";
import {
  LINK_TYPE_OPTIONS, LINK_VISIBILITY_OPTIONS, linkSchema, type LinkInput,
} from "@/lib/validation/project";
import { LinkEnumSelectField } from "./link-form-fields";
import type { LinkRow } from "./types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function toDefaults(link?: LinkRow): LinkInput {
  return {
    name: link?.name ?? "",
    url: link?.url ?? "",
    type: link?.type ?? "custom",
    environment: link?.environment ?? null,
    description: link?.description ?? null,
    visibility: link?.visibility ?? "project",
  };
}

export function LinkForm({
  projectId,
  link,
  onSuccess,
}: {
  projectId: string;
  link?: LinkRow;
  onSuccess: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<LinkInput>({
    resolver: zodResolver(linkSchema),
    defaultValues: toDefaults(link),
  });

  function onSubmit(values: LinkInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await upsertLinkAction(projectId, values, link?.id);
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
        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>URL</FormLabel>
              <FormControl render={<Input {...field} placeholder="https://…" />} />
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-3">
          <LinkEnumSelectField control={form.control} name="type" label="Type" options={LINK_TYPE_OPTIONS} />
          <LinkEnumSelectField
            control={form.control}
            name="visibility"
            label="Visibility"
            options={LINK_VISIBILITY_OPTIONS}
          />
        </div>
        <FormField
          control={form.control}
          name="environment"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Environment</FormLabel>
              <FormControl render={<Input {...field} value={field.value ?? ""} placeholder="e.g. prod" />} />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl render={<Textarea rows={2} {...field} value={field.value ?? ""} />} />
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save link"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
