import type { Control, FieldPath } from "react-hook-form";
import { humanize } from "../types";
import type { EditProjectInput } from "@/lib/validation/project";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

export const TEXT_FIELDS: { name: FieldPath<EditProjectInput>; label: string }[] = [
  { name: "description", label: "Description" },
  { name: "risks", label: "Risks" },
  { name: "blockers", label: "Blockers" },
  { name: "next_steps", label: "Next steps" },
  { name: "internal_notes", label: "Internal notes" },
  { name: "client_notes", label: "Client notes" },
];

/** Status/health/priority are all enum <Select>s bound the same way — one field renderer for all three. */
export function EnumSelectField({
  control,
  name,
  label,
  options,
}: {
  control: Control<EditProjectInput>;
  name: "status" | "health" | "priority";
  label: string;
  options: readonly string[];
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
                <SelectItem key={o} value={o}>
                  {humanize(o)}
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

/** Start date / deadline are both plain <input type="date">s bound the same way. */
export function DateField({
  control,
  name,
  label,
}: {
  control: Control<EditProjectInput>;
  name: "start_date" | "deadline";
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

export function ProgressField({ control }: { control: Control<EditProjectInput> }) {
  return (
    <FormField
      control={control}
      name="progress"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Progress %</FormLabel>
          <FormControl
            render={
              <Input
                type="number"
                min={0}
                max={100}
                {...field}
                onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
              />
            }
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function TagsField({ control }: { control: Control<EditProjectInput> }) {
  return (
    <FormField
      control={control}
      name="tags"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Tags (comma-separated)</FormLabel>
          <FormControl
            render={
              <Input
                value={(field.value ?? []).join(", ")}
                onChange={(e) =>
                  field.onChange(e.target.value.split(",").map((t) => t.trim()).filter(Boolean))
                }
              />
            }
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Free-text project fields (description/risks/blockers/...) all render the same textarea shape. */
export function TextAreaField({
  control,
  name,
  label,
}: {
  control: Control<EditProjectInput>;
  name: FieldPath<EditProjectInput>;
  label: string;
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
              <Textarea
                rows={2}
                {...field}
                value={typeof field.value === "string" ? field.value : (field.value ?? "")}
              />
            }
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
