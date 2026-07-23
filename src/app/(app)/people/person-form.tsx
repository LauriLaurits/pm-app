"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { upsertPersonAction } from "@/app/actions/people";
import {
  EMPLOYMENT_TYPE_OPTIONS, PERSON_STATUS_OPTIONS, personSchema, type PersonInput,
} from "@/lib/validation/person";
import {
  ManagedOptionSelectField, PersonEnumSelectField, WeeklyCapacityField,
} from "./person-form-fields";
import { FormSection } from "@/components/form-section";
import { PersonAvatarPicker } from "@/components/person-avatar";
import { DEFAULT_PERSON_AVATAR, isPersonAvatarPreset } from "@/lib/person-avatar-presets";
import type { PersonListRow } from "./types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

function toDefaults(person?: PersonListRow): PersonInput {
  return {
    full_name: person?.full_name ?? "",
    email: person?.email ?? null,
    // Keep an existing photo URL as-is -- coercing it to a preset would wipe the photo on save.
    avatar_url: person?.avatar_url ?? DEFAULT_PERSON_AVATAR,
    role_title: person?.role_title ?? null,
    department: person?.department ?? null,
    employment_type: person?.employment_type ?? "employee",
    weekly_capacity_hours: person?.weekly_capacity_hours ?? 40,
    status: person?.status ?? "active",
  };
}

export function PersonForm({
  person,
  roleTitleOptions,
  teamOptions,
  onSuccess,
}: {
  person?: PersonListRow;
  roleTitleOptions: string[];
  teamOptions: string[];
  onSuccess: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<PersonInput>({
    resolver: zodResolver(personSchema),
    defaultValues: toDefaults(person),
  });

  function onSubmit(values: PersonInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await upsertPersonAction(values, person?.id);
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
        <FormSection first tone="blue" title="Identity">
          <FormField
            control={form.control}
            name="avatar_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Avatar</FormLabel>
                <PersonAvatarPicker
                  value={field.value ?? DEFAULT_PERSON_AVATAR}
                  onChange={field.onChange}
                  photoUrl={
                    person?.avatar_url && !isPersonAvatarPreset(person.avatar_url)
                      ? person.avatar_url
                      : null
                  }
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="full_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full name</FormLabel>
                <FormControl render={<Input {...field} />} />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl render={<Input type="email" {...field} value={field.value ?? ""} />} />
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>
        <FormSection tone="emerald" title="Role & team">
          <div className="grid grid-cols-2 gap-3">
            <ManagedOptionSelectField
              control={form.control}
              name="role_title"
              label="Role title"
              options={roleTitleOptions}
            />
            <ManagedOptionSelectField
              control={form.control}
              name="department"
              label="Team"
              options={teamOptions}
            />
          </div>
        </FormSection>
        <FormSection tone="amber" title="Employment & capacity">
          <div className="grid grid-cols-2 gap-3">
            <PersonEnumSelectField
              control={form.control}
              name="employment_type"
              label="Employment type"
              options={EMPLOYMENT_TYPE_OPTIONS}
            />
            <WeeklyCapacityField control={form.control} />
          </div>
          <PersonEnumSelectField control={form.control} name="status" label="Status" options={PERSON_STATUS_OPTIONS} />
        </FormSection>
        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save person"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
