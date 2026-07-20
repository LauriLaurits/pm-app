"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type MultiSelectOption = { value: string; label: string };

/**
 * Generic chip-style multi-select -- a controlled wrapper over the base-ui `ToggleGroup` (already
 * used single-select for the projects table's list/cards `ViewToggle`) with `multiple` turned on,
 * so it's the same visual/keyboard behavior, just letting more than one chip stay pressed at once.
 * Used wherever a form needs "toggle which of these apply" over a bounded, small-to-medium option
 * set (own projects, delegatable permissions, ...) -- for a single-select searchable picker over a
 * large list instead, see the delegations screen's PersonPickerField, which is a different shape
 * of problem (search-to-narrow, one answer) and not a fit for this component.
 */
export function MultiSelectToggle({
  options,
  value,
  onValueChange,
  emptyMessage = "Nothing available.",
  "aria-label": ariaLabel,
}: {
  options: MultiSelectOption[];
  value: string[];
  onValueChange: (next: string[]) => void;
  emptyMessage?: string;
  "aria-label"?: string;
}) {
  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ToggleGroup
      multiple
      value={value}
      onValueChange={onValueChange}
      variant="outline"
      spacing={2}
      className="w-full flex-wrap"
      aria-label={ariaLabel}
    >
      {options.map((opt) => (
        <ToggleGroupItem key={opt.value} value={opt.value} className="h-auto py-1.5">
          {opt.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
