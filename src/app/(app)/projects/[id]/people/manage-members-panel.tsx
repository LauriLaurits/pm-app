"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { CandidateRow } from "./candidate-row";
import type { CandidateOption } from "./types";

/** Searchable checklist of every addable person for a project. Each row's checkbox IS the
 * membership: checking it calls addMemberAction, unchecking calls removeMemberAction, both
 * immediately (see CandidateRow) -- role/dates on an existing membership stay editable via the
 * existing per-row "Edit" control on the People tab's table, not here. */
export function ManageMembersPanel({
  projectId,
  candidates,
}: {
  projectId: string;
  candidates: CandidateOption[];
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => c.full_name.toLowerCase().includes(q));
  }, [candidates, query]);

  const memberCount = candidates.filter((c) => c.memberId !== null).length;

  if (candidates.length === 0) {
    return <p className="text-sm text-muted-foreground">No addable people found.</p>;
  }

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search people…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search people"
      />
      <p className="text-xs text-muted-foreground">
        {memberCount} of {candidates.length} people on this project
      </p>
      <div className="max-h-80 space-y-0.5 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No matches.</p>
        ) : (
          filtered.map((c) => <CandidateRow key={c.user_id} projectId={projectId} candidate={c} />)
        )}
      </div>
    </div>
  );
}
