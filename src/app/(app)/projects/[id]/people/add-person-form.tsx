"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addProjectPersonAction } from "@/app/actions/project-people";
import { addProjectPersonSchema, type AddProjectPersonInput } from "@/lib/validation/project";
import type { CandidateOption } from "./types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export function AddPersonForm({
  projectId,
  candidates,
  onSuccess,
}: {
  projectId: string;
  candidates: CandidateOption[];
  onSuccess: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<AddProjectPersonInput>({
    resolver: zodResolver(addProjectPersonSchema),
    defaultValues: {
      user_id: "",
      role_on_project: null,
      days_per_week: 3,
      starts_on: null,
      ends_on: null,
    },
  });

  function onSubmit(values: AddProjectPersonInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await addProjectPersonAction(projectId, values);
      if ("error" in result) setServerError(result.error);
      else onSuccess();
    });
  }

  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Everyone with an account is already on this project.
      </p>
    );
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
          name="user_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Person</FormLabel>
              <Select value={field.value} onValueChange={(v) => field.onChange(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a person">
                    {(v: string) => candidates.find((c) => c.user_id === v)?.full_name ?? "Select a person"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.user_id} value={c.user_id}>
                      {c.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="role_on_project"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role on project</FormLabel>
                <FormControl
                  render={<Input placeholder="e.g. Backend" {...field} value={field.value ?? ""} />}
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="days_per_week"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Days per week</FormLabel>
                <FormControl
                  render={
                    <Input
                      type="number"
                      min={0.5}
                      max={5}
                      step={0.5}
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)}
                    />
                  }
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="starts_on"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Starts</FormLabel>
                <FormControl render={<Input type="date" {...field} value={field.value ?? ""} />} />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="ends_on"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ends</FormLabel>
                <FormControl render={<Input type="date" {...field} value={field.value ?? ""} />} />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Adding…" : "Add to project"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
