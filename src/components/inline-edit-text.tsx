"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SaveResult = { error: string } | { success: true };

/**
 * Free-text sibling of InlineEditSelect (see that file) for fields that aren't a bounded enum --
 * currently just members-table's role_on_project. Click the text to get an inline <Input>;
 * Enter/blur saves, Escape reverts without saving. Same optimistic-update / revert-on-error /
 * canEdit-gates-the-affordance contract as InlineEditSelect.
 */
export function InlineEditText({
  value,
  canEdit,
  onSave,
  ariaLabel,
  placeholder = "—",
  className,
}: {
  value: string | null;
  canEdit: boolean;
  onSave: (value: string) => Promise<SaveResult>;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
}) {
  const [current, setCurrent] = useState(value ?? "");
  const [draft, setDraft] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const display = (
    <span className={cn(isPending && "opacity-60", !current && "text-muted-foreground", className)}>
      {isPending && <Loader2Icon className="mr-1 inline size-3 animate-spin" />}
      {current || placeholder}
    </span>
  );

  if (!canEdit) return display;

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next === current) return;
    const previous = current;
    setCurrent(next); // optimistic -- reverted below if the save fails
    setError(null);
    startTransition(async () => {
      const result = await onSave(next);
      if ("error" in result) {
        setCurrent(previous);
        setError(result.error);
      }
    });
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setDraft(current);
              setEditing(false);
            }
          }}
          aria-label={ariaLabel}
          className="h-7 w-40"
        />
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(current);
        setEditing(true);
      }}
      disabled={isPending}
      aria-label={`Change ${ariaLabel}`}
      className="cursor-pointer rounded-md text-left outline-none disabled:cursor-not-allowed focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {display}
      {error && <span className="block text-xs text-destructive">{error}</span>}
    </button>
  );
}
