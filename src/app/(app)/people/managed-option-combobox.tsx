"use client";

import { useMemo, useState, useTransition } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDownIcon, Loader2Icon, PlusIcon, XIcon } from "lucide-react";
import { addManagedOptionAction } from "@/app/actions/managed-options";
import { cn } from "@/lib/utils";

type Item = { value: string; creatable?: boolean };

/** Single-select creatable combobox over an admin/PM-managed vocabulary (managed_options).
 * Typing filters; a query matching no existing option (case-insensitive) grows a trailing
 * `+ Add "…"` item that persists the value via addManagedOptionAction and selects it. The
 * Clear (X) affordance maps to null ("—" semantics of the old select). A saved value that has
 * since been removed from the list stays selectable (prepended), matching the old behavior. */
export function ManagedOptionCombobox({
  kind,
  value,
  onChange,
  options,
  ariaLabel,
}: {
  kind: "role_title" | "team";
  value: string | null;
  onChange: (value: string | null) => void;
  options: string[];
  ariaLabel: string;
}) {
  // Seed from `value` (not "") so an already-saved value shows on mount instead of a blank input
  // -- controlling `inputValue` opts out of Base UI's own "derive input text from selection" sync.
  const [query, setQuery] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Re-sync if `value` changes from outside this component (e.g. the form is reset to a
  // different person while this instance stays mounted). Adjusting state during render (the
  // React-documented pattern for "state changed because a prop changed", using state rather than
  // a ref -- this repo's lint rules forbid ref reads/writes during render) avoids an extra commit
  // plus the set-state-in-effect lint rule.
  const [syncedValue, setSyncedValue] = useState(value);
  if (syncedValue !== value) {
    setSyncedValue(value);
    setQuery(value ?? "");
  }

  const baseOptions = useMemo(
    () => (value && !options.includes(value) ? [value, ...options] : options),
    [value, options]
  );

  const items = useMemo<Item[]>(() => {
    const trimmedRaw = query.trim();
    // The input is filled with the selected value's label (on mount and after every selection).
    // Treat that as "no query" so reopening the popup shows the full list instead of narrowing to
    // just the selected item -- otherwise `filter={null}` plus our own filtering below would
    // permanently opt out of Base UI's internal bypass for this case.
    const trimmed = trimmedRaw.toLowerCase() === (value ?? "").toLowerCase() ? "" : trimmedRaw;
    const matches = baseOptions
      .filter((o) => o.toLowerCase().includes(trimmed.toLowerCase()))
      .map((o) => ({ value: o }));
    const exact = baseOptions.some((o) => o.toLowerCase() === trimmed.toLowerCase());
    return trimmed && !exact ? [...matches, { value: trimmed, creatable: true }] : matches;
  }, [baseOptions, query, value]);

  const selectedItem = useMemo<Item | null>(() => (value ? { value } : null), [value]);

  function select(item: Item | null) {
    setError(null);
    if (!item) {
      onChange(null);
      return;
    }
    if (!item.creatable) {
      onChange(item.value);
      return;
    }
    const previous = value;
    onChange(item.value); // optimistic -- reverted if the save fails
    startTransition(async () => {
      const result = await addManagedOptionAction(kind, item.value);
      if ("error" in result) {
        // "already exists" (unique violation) means the value is legitimately selectable --
        // keep it; anything else reverts.
        if (result.error !== "That entry already exists.") {
          onChange(previous);
          setError(result.error);
        }
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Combobox.Root
        items={items}
        value={selectedItem}
        onValueChange={select}
        inputValue={query}
        onInputValueChange={setQuery}
        isItemEqualToValue={(a: Item, b: Item) => a.value === b.value}
        itemToStringValue={(item: Item) => item.value}
        itemToStringLabel={(item: Item) => item.value}
        filter={null}
      >
        <Combobox.InputGroup
          className={cn(
            "flex h-8 w-full items-center gap-1 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50"
          )}
        >
          <Combobox.Input
            aria-label={ariaLabel}
            placeholder="—"
            disabled={isPending}
            className="h-full w-full border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
          {isPending ? (
            <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <div className="flex shrink-0 items-center text-muted-foreground">
              <Combobox.Clear
                aria-label="Clear selection"
                className="flex size-6 items-center justify-center rounded-sm hover:bg-accent hover:text-accent-foreground"
              >
                <XIcon className="size-3.5" />
              </Combobox.Clear>
              <Combobox.Trigger
                aria-label="Open popup"
                className="flex size-6 items-center justify-center rounded-sm hover:bg-accent hover:text-accent-foreground"
              >
                <ChevronDownIcon className="size-4" />
              </Combobox.Trigger>
            </div>
          )}
        </Combobox.InputGroup>

        <Combobox.Portal>
          <Combobox.Positioner className="isolate z-50" sideOffset={4}>
            <Combobox.Popup className="max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
              <Combobox.Empty className="px-2 py-1.5 text-sm text-muted-foreground">
                No options yet -- start typing to add one.
              </Combobox.Empty>
              <Combobox.List>
                {(item: Item) => (
                  <Combobox.Item
                    key={item.value}
                    value={item}
                    className="relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                  >
                    {item.creatable ? (
                      <>
                        <PlusIcon className="size-4 shrink-0" />
                        <span className="truncate">Add &quot;{item.value}&quot;</span>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 truncate">{item.value}</span>
                        <Combobox.ItemIndicator
                          render={
                            <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
                          }
                        >
                          <CheckIcon className="pointer-events-none size-4" />
                        </Combobox.ItemIndicator>
                      </>
                    )}
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
