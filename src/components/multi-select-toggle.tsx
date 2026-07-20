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
 *
 * On/off contrast: the base `outline` toggle variant only differentiates "on" via
 * `aria-pressed:bg-muted`, which reads as "barely there" once you have a dozen chips -- easy to
 * lose track of what's actually selected. (Base UI's `Toggle` never sets a `data-state` attribute
 * -- only `data-pressed` and `aria-pressed` -- so overrides here must key off `aria-pressed`, not
 * the shadcn-typical `data-[state=on]`.) Here "on" is filled with the primary/accent color (a real
 * color change, not just a shade) via `!` to win over that base rule, "off" stays a plain muted
 * outline, and a live "N selected" count sits above the chips so the group's state is legible at a
 * glance without counting filled chips.
 */
export function MultiSelectToggle({
  options,
  value,
  onValueChange,
  emptyMessage = "Nothing available.",
  showCount = true,
  "aria-label": ariaLabel,
}: {
  options: MultiSelectOption[];
  value: string[];
  onValueChange: (next: string[]) => void;
  emptyMessage?: string;
  showCount?: boolean;
  "aria-label"?: string;
}) {
  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-2">
      {showCount && (
        <p className="text-xs font-medium text-muted-foreground">
          {value.length} of {options.length} selected
        </p>
      )}
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
          <ToggleGroupItem
            key={opt.value}
            value={opt.value}
            className="h-auto border-input py-1.5 text-foreground aria-pressed:border-primary! aria-pressed:bg-primary! aria-pressed:text-primary-foreground! aria-pressed:hover:bg-primary/90!"
          >
            {opt.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
