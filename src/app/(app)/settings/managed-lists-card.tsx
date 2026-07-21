"use client";

import { useState, useTransition } from "react";
import {
  addManagedOptionAction, deleteManagedOptionAction,
} from "@/app/actions/managed-options";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DESTRUCTIVE_ACTION_CLASS } from "@/lib/action-styles";
import { cn } from "@/lib/utils";

export type ManagedOption = { id: string; kind: string; value: string };

/** Admin-only "Lists" card: the role titles + teams offered as selects in the person form.
 * UX gating only -- addManagedOptionAction/deleteManagedOptionAction re-check requireAdmin()
 * server-side, and the managed_options RLS write policy is is_admin(). */
export function ManagedListsCard({ options }: { options: ManagedOption[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lists</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <ManagedList
          kind="role_title"
          title="Role titles"
          options={options.filter((o) => o.kind === "role_title")}
        />
        <ManagedList kind="team" title="Teams" options={options.filter((o) => o.kind === "team")} />
      </CardContent>
    </Card>
  );
}

function ManagedList({
  kind,
  title,
  options,
}: {
  kind: "role_title" | "team";
  title: string;
  options: ManagedOption[];
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onAdd() {
    const trimmed = value.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const result = await addManagedOptionAction(kind, trimmed);
      if ("error" in result) setError(result.error);
      else setValue("");
    });
  }

  function onRemove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteManagedOptionAction(id);
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="space-y-1">
        {options.length === 0 && <li className="text-sm text-muted-foreground">—</li>}
        {options.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
            <span>{o.value}</span>
            <Button
              size="sm"
              variant="ghost"
              className={cn("h-7 px-2 text-xs", DESTRUCTIVE_ACTION_CLASS)}
              disabled={isPending}
              onClick={() => onRemove(o.id)}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onAdd();
        }}
        className="flex items-center gap-2"
      >
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={`New ${title.toLowerCase()} entry`}
          className="h-8"
        />
        <Button type="submit" size="sm" disabled={isPending || !value.trim()}>
          Add
        </Button>
      </form>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
