"use client";

import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initials } from "./types";
import type { PersonOption } from "./types";

/** Single searchable picker over people with a linked user account (see page.tsx's query --
 * `people` with `user_id is not null`, self excluded). A plain <Select> has no in-list search, and
 * an org can have dozens of people, so this borrows the "search input above a scrollable
 * checklist" shape from ManageMembersPanel but resolves to one answer: picking a row collapses
 * back to just the chosen person + a "Change" button instead of staying an always-on checklist. */
export function PersonPickerField({
  value,
  onChange,
  options,
}: {
  value: string | null;
  onChange: (userId: string) => void;
  options: PersonOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.user_id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.full_name.toLowerCase().includes(q));
  }, [options, query]);

  if (selected && !editing) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-input px-3 py-2">
        <div className="flex items-center gap-2">
          <Avatar size="sm">
            <AvatarImage src={selected.avatar_url ?? undefined} alt={selected.full_name} />
            <AvatarFallback>{initials(selected.full_name)}</AvatarFallback>
          </Avatar>
          <span className="text-sm">{selected.full_name}</span>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        autoFocus={!!selected}
        placeholder="Search people…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search people"
      />
      <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-input p-1">
        {filtered.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">No matches.</p>
        ) : (
          filtered.map((o) => (
            <button
              key={o.user_id}
              type="button"
              onClick={() => {
                onChange(o.user_id);
                setEditing(false);
                setQuery("");
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted/50"
            >
              <Avatar size="sm">
                <AvatarImage src={o.avatar_url ?? undefined} alt={o.full_name} />
                <AvatarFallback>{initials(o.full_name)}</AvatarFallback>
              </Avatar>
              <span className="text-sm">{o.full_name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
