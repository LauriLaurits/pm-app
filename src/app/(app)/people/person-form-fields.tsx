import type { Control } from "react-hook-form";
import {
  EMPLOYMENT_TYPE_OPTIONS, PERSON_STATUS_OPTIONS, type PersonInput,
} from "@/lib/validation/person";
import { humanize } from "./types";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

/** employment_type/status are both enum <Select>s bound the same way — one renderer for both. */
export function PersonEnumSelectField({
  control,
  name,
  label,
  options,
}: {
  control: Control<PersonInput>;
  name: "employment_type" | "status";
  label: string;
  options: typeof EMPLOYMENT_TYPE_OPTIONS | typeof PERSON_STATUS_OPTIONS;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select value={field.value} onValueChange={(v) => field.onChange(v)}>
            <SelectTrigger className="w-full">
              <SelectValue>{(v: string) => humanize(v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o} value={o}>{humanize(o)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** weekly_capacity_hours: numeric(5,2), must be >0 and <=168 -- always required (no null state). */
export function WeeklyCapacityField({ control }: { control: Control<PersonInput> }) {
  return (
    <FormField
      control={control}
      name="weekly_capacity_hours"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Weekly capacity (hours)</FormLabel>
          <FormControl
            render={
              <Input
                type="number"
                min={0}
                max={168}
                step="0.5"
                {...field}
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value === "" ? 0 : e.target.valueAsNumber)}
              />
            }
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
