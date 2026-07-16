import { AttentionList } from "./attention-list";
import type { AttentionItem } from "./types";

// Pure layout -- every list's items are already computed in page.tsx (it's the one holding all
// the raw rows); this just arranges the up-to-seven sections in a responsive grid. The
// over-budget section is entirely omitted (not rendered empty) when the viewer has no budget
// visibility at all, per the same "omit, don't show an empty finance panel" rule as the charts.
export function AttentionSections({
  recentlyUpdated,
  needsAttention,
  expiringCredentials,
  overBudget,
  overallocatedPeople,
  noPm,
  staleStatus,
}: {
  recentlyUpdated: AttentionItem[];
  needsAttention: AttentionItem[];
  expiringCredentials: AttentionItem[];
  overBudget: AttentionItem[] | null;
  overallocatedPeople: AttentionItem[];
  noPm: AttentionItem[];
  staleStatus: AttentionItem[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      <AttentionList
        title="Recently updated projects"
        emptyMessage="No projects yet."
        items={recentlyUpdated}
      />
      <AttentionList
        title="Projects needing attention"
        emptyMessage="Nothing at risk right now."
        items={needsAttention}
      />
      <AttentionList
        title="Expiring credentials"
        emptyMessage="No credentials expiring soon."
        items={expiringCredentials}
      />
      {overBudget && (
        <AttentionList
          title="Over-budget projects"
          emptyMessage="No project is over budget."
          items={overBudget}
        />
      )}
      <AttentionList
        title="Overallocated people"
        emptyMessage="Nobody is overallocated."
        items={overallocatedPeople}
      />
      <AttentionList
        title="Projects without a PM"
        emptyMessage="Every project has a PM assigned."
        items={noPm}
      />
      <AttentionList
        title="Stale status (14+ days)"
        emptyMessage="Every project has a recent status update."
        items={staleStatus}
      />
    </div>
  );
}
