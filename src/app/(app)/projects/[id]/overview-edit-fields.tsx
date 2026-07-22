import { useState } from "react";
import type { Control, FieldPath } from "react-hook-form";
import { humanize } from "../types";
import type { EditProjectInput } from "@/lib/validation/project";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

// `blockers` and `next_steps` are intentionally NOT here: point-in-time blockers/next-milestone
// live in status updates now, so asking for them again on the project record was double entry.
// The columns still exist and their values round-trip via the form defaults, untouched.
export const TEXT_FIELDS: { name: FieldPath<EditProjectInput>; label: string }[] = [
  { name: "description", label: "Description" },
  { name: "risks", label: "Risks" },
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
  name: "status" | "health" | "priority" | "budget_type";
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

/** Same comma-bug fix as the create form's TagsInput (project-create-fields.tsx): the input
 * used to re-derive its value from the parsed array, which stripped the comma the user just
 * typed. Raw text lives in local state; the parsed tags array is committed on every change. */
export function TagsField({ control }: { control: Control<EditProjectInput> }) {
  return (
    <FormField
      control={control}
      name="tags"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Tags (comma-separated)</FormLabel>
          <FormControl render={<TagsInput value={field.value ?? []} onChange={field.onChange} />} />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function TagsInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const [text, setText] = useState(() => (value ?? []).join(", "));
  return (
    <Input
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value.split(",").map((t) => t.trim()).filter(Boolean));
      }}
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
                value={typeof field.value === "string" ? field.value : ""}
              />
            }
          />
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
