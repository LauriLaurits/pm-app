import type { Control, FieldPath } from "react-hook-form";
import { BILLING_MODEL_OPTIONS, PART_STATUS_OPTIONS, type PartInput } from "@/lib/validation/project";
import { humanize } from "../../types";
import type { PersonOption } from "./types";
import { Input } from "@/components/ui/input";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

/** Status/billing_model are both enum <Select>s bound the same way — one renderer for both. */
export function EnumSelectField({
  control,
  name,
  label,
  options,
}: {
  control: Control<PartInput>;
  name: "status" | "billing_model";
  label: string;
  options: typeof PART_STATUS_OPTIONS | typeof BILLING_MODEL_OPTIONS;
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

/** Responsible person -- a Select over the people the caller can see (RLS: view_people),
 * with an explicit "Unassigned" sentinel since the underlying value can be null. */
export function ResponsiblePersonField({
  control,
  people,
}: {
  control: Control<PartInput>;
  people: PersonOption[];
}) {
  return (
    <FormField
      control={control}
      name="responsible_person_id"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Responsible person</FormLabel>
          <Select
            value={field.value ?? "none"}
            onValueChange={(v) => field.onChange(v === "none" ? null : v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string) => (v === "none" ? "Unassigned" : (people.find((p) => p.id === v)?.full_name ?? "Unassigned"))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Est. hours / progress / the three billing figures all share this shape. `nullable`
 * controls whether a cleared input becomes `null` (optional figures) or `0` (progress). */
export function NumberField({
  control,
  name,
  label,
  nullable = true,
}: {
  control: Control<PartInput>;
  name: FieldPath<PartInput>;
  label: string;
  nullable?: boolean;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl
            render={
              <Input
                type="number"
                min={0}
                {...field}
                value={field.value ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  field.onChange(raw === "" ? (nullable ? null : 0) : e.target.valueAsNumber);
                }}
              />
            }
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function DateField({
  control,
  name,
  label,
}: {
  control: Control<PartInput>;
  name: "start_date" | "end_date";
  label: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl render={<Input type="date" {...field} value={field.value ?? ""} />} />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
