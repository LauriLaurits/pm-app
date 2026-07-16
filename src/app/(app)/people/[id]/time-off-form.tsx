"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { upsertTimeOffAction } from "@/app/actions/time-off";
import { TIME_OFF_TYPE_OPTIONS, timeOffSchema, type TimeOffInput } from "@/lib/validation/time-off";
import { humanize } from "../types";
import type { TimeOffRow } from "./types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function defaults(timeOff?: TimeOffRow): TimeOffInput {
  return {
    starts_on: timeOff?.starts_on ?? todayIso(),
    ends_on: timeOff?.ends_on ?? todayIso(),
    type: timeOff?.type ?? "vacation",
    note: timeOff?.note ?? null,
  };
}

export function TimeOffForm({
  personId,
  timeOff,
  onSuccess,
}: {
  personId: string;
  timeOff?: TimeOffRow;
  onSuccess: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<TimeOffInput>({
    resolver: zodResolver(timeOffSchema),
    defaultValues: defaults(timeOff),
  });

  function onSubmit(values: TimeOffInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await upsertTimeOffAction(personId, values, timeOff?.id);
      if ("error" in result) setServerError(result.error);
      else {
        if (!timeOff) form.reset(defaults());
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
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="starts_on"
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
            name="ends_on"
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
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type</FormLabel>
              <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: string) => humanize(v)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {TIME_OFF_TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>{humanize(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note (optional)</FormLabel>
              <FormControl render={<Textarea rows={2} {...field} value={field.value ?? ""} />} />
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : timeOff ? "Save changes" : "Add time off"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
