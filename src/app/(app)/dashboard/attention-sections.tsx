import { AttentionList } from "./attention-list";
import type { AttentionItem } from "./types";

// Pure layout -- every list's items are already computed in page.tsx (it's the one holding all
// the raw rows); this just arranges the action sections in a responsive grid. Each list is a
// "go fix this" queue (health, expiring creds, over budget, overallocation, missing PM, stale
// status), so they earn a spot even when empty -- an empty "No project is over budget" is
// reassurance, not noise. The over-budget section is omitted entirely (not rendered empty) when
// the viewer has no budget visibility, per the same "omit, don't show an empty finance panel" rule
// as the charts.
export function AttentionSections({
  needsAttention,
  expiringCredentials,
  overBudget,
  overallocatedPeople,
  noPm,
  staleStatus,
}: {
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
