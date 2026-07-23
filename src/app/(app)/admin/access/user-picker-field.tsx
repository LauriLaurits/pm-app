"use client";

import { useMemo, useState } from "react";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UserOption } from "./types";

/** Single searchable picker over active users (page.tsx's query -- user_profiles where status =
 * 'active'; a grant to a pending/disabled account wouldn't do anything useful anyway). Same shape
 * as the delegations screen's PersonPickerField (search input above a scrollable list, collapsing
 * to the chosen person + "Change" once picked) -- kept as its own small component here rather than
 * importing across route folders, matching how every other route in this app owns its picker. */
export function UserPickerField({
  value,
  onChange,
  options,
}: {
  value: string | null;
  onChange: (userId: string) => void;
  options: UserOption[];
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
          <PersonAvatar name={selected.full_name} avatarUrl={selected.avatar_url} className="size-8" />
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
        placeholder="Search users…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search users"
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
              <PersonAvatar name={o.full_name} avatarUrl={o.avatar_url} className="size-8" />
              <span className="text-sm">{o.full_name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
