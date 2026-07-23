import type { Control } from "react-hook-form";
import {
  EMPLOYMENT_TYPE_OPTIONS, PERSON_STATUS_OPTIONS, type PersonInput,
} from "@/lib/validation/person";
import { EmploymentTypeBadge } from "./employment-type-badge";
import type { EmploymentType } from "./types";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Options render exactly as the list view shows the value: status as the dot language ("● Active"
// green / "● Deactivated" red -- same wording as the table, not the raw enum), employment type
// as the uppercase micro-chip.
const STATUS_OPTION: Record<(typeof PERSON_STATUS_OPTIONS)[number], { label: string; dot: string }> = {
  active: { label: "Active", dot: "bg-emerald-500" },
  inactive: { label: "Deactivated", dot: "bg-red-500" },
};

function PersonOptionLabel({ name, value }: { name: "employment_type" | "status"; value: string }) {
  if (name === "status") {
    const opt = STATUS_OPTION[value as (typeof PERSON_STATUS_OPTIONS)[number]];
    return (
      <span className="flex items-center gap-2">
        <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${opt.dot}`} />
        {opt.label}
      </span>
    );
  }
  return <EmploymentTypeBadge type={value as EmploymentType} />;
}

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
              <SelectValue>{(v: string) => <PersonOptionLabel name={name} value={v} />}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o} value={o}>
                  <PersonOptionLabel name={name} value={o} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

const NONE = "__none__";

/** role_title/department are nullable text columns fed from admin-managed lists (managed_options,
 * curated in Settings -> Lists). A person's saved value stays selectable even if an admin has
 * since removed it from the list; "—" clears back to null. */
export function ManagedOptionSelectField({
  control,
  name,
  label,
  options,
}: {
  control: Control<PersonInput>;
  name: "role_title" | "department";
  label: string;
  options: string[];
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const items =
          field.value && !options.includes(field.value) ? [field.value, ...options] : options;
        return (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <Select
              value={field.value ?? NONE}
              onValueChange={(v) => field.onChange(v === NONE ? null : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{(v: string) => (v === NONE ? "—" : v)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {items.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        );
      }}
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
