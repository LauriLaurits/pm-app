"use client";

import { useState, useTransition } from "react";
import { ChevronDownIcon, Loader2Icon } from "lucide-react";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

export type InlineEditOption = {
  value: string;
  label: string;
  /** Badge styling for this option's value (falls back to "outline"). */
  badgeVariant?: BadgeVariant;
  badgeClassName?: string;
  /** When set, a small colored dot renders before the label ("● Active" style) -- pass the
   * dot's bg class, e.g. "bg-emerald-500". */
  dotClassName?: string;
};

type SaveResult = { error: string } | { success: true };

/**
 * One reusable "click the badge, get an inline <Select>, save on change" cell -- the shared
 * implementation for every list/table inline-edit surface (projects status/health/priority,
 * parts status/responsible person, admin user role). Non-editors (canEdit=false) get the plain
 * badge with no interactive affordance at all -- the caller computes canEdit server-side; this
 * component never re-checks permissions itself, since the real boundary is always the
 * `onSave` server action re-running `requirePermission(...)` regardless of what's rendered here.
 */
export function InlineEditSelect({
  value,
  options,
  canEdit,
  onSave,
  ariaLabel,
  className,
}: {
  value: string;
  options: InlineEditOption[];
  canEdit: boolean;
  onSave: (value: string) => Promise<SaveResult>;
  ariaLabel: string;
  className?: string;
}) {
  const [current, setCurrent] = useState(value);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const active = options.find((o) => o.value === current);
  const badge = (
    <Badge
      variant={active?.badgeVariant ?? "outline"}
      className={cn(active?.badgeClassName, isPending && "opacity-60", className)}
    >
      {isPending && <Loader2Icon className="animate-spin" />}
      {active?.dotClassName && (
        <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", active.dotClassName)} />
      )}
      {active?.label ?? current}
      {/* Editability must be discoverable: editors always see a small chevron on the chip. */}
      {canEdit && <ChevronDownIcon aria-hidden className="size-3 opacity-50" />}
    </Badge>
  );

  if (!canEdit) return badge;

  function handleValueChange(next: string | null) {
    setEditing(false);
    if (!next || next === current) return;
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

  return (
    <div className="flex flex-col items-start gap-1">
      {editing ? (
        <Select
          value={current}
          onValueChange={handleValueChange}
          open={editing}
          onOpenChange={(next) => setEditing(next)}
          disabled={isPending}
        >
          <SelectTrigger size="sm" aria-label={ariaLabel} className="h-6">
            <SelectValue>{(v: string) => options.find((o) => o.value === v)?.label ?? v}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {/* Options look exactly like the values they set -- same badge, same dot. */}
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                <Badge variant={o.badgeVariant ?? "outline"} className={o.badgeClassName}>
                  {o.dotClassName && (
                    <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", o.dotClassName)} />
                  )}
                  {o.label}
                </Badge>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={isPending}
          aria-label={`Change ${ariaLabel}`}
          className="cursor-pointer rounded-4xl outline-none disabled:cursor-not-allowed focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {badge}
        </button>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
