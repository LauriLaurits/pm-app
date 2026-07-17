import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { humanize } from "./types";
import { Input } from "@/components/ui/input";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

/** A single money figure -- shared by PartBudgetEditDialog (client price / fixed amount /
 * hourly rate / planned & actual internal cost) and BudgetItemForm (amount). Mirrors NumberField
 * in parts/part-form-fields.tsx, generalized over the form's value type since it's reused across
 * several unrelated forms here. Blank clears to `null` unless `nullable` is false, in which case
 * it clears to `0` (budget_items.amount is NOT NULL). */
export function MoneyField<T extends FieldValues>({
  control,
  name,
  label,
  nullable = true,
}: {
  control: Control<T>;
  name: FieldPath<T>;
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
                step="0.01"
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

export function DateField<T extends FieldValues>({
  control,
  name,
  label,
}: {
  control: Control<T>;
  name: FieldPath<T>;
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

/** Item-type <Select> for BudgetItemForm. `options` is pre-filtered by the caller to
 * CLIENT_BUDGET_ITEM_TYPES or the full BUDGET_ITEM_TYPE_OPTIONS set depending on whether this
 * viewer holds view_internal_cost -- a PM is never even offered planned_cost/actual_cost here. */
export function ItemTypeField<T extends FieldValues>({
  control,
  name,
  options,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  options: readonly string[];
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Type</FormLabel>
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
