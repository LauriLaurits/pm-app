import { DelegationCard } from "./delegation-card";
import type { DelegationGroup, DelegationListItem } from "./types";

const SECTIONS: { key: DelegationGroup; title: string; emptyText: string }[] = [
  { key: "active", title: "Active", emptyText: "No active delegations right now." },
  { key: "upcoming", title: "Upcoming", emptyText: "Nothing scheduled yet." },
  { key: "past", title: "Expired / revoked", emptyText: "No history yet." },
];

/** Groups the already-classified list into the three sections the spec calls for (Active /
 * Upcoming / Expired-or-revoked, the last two merged into one "past" bucket by
 * classifyDelegation) and renders each with its own empty state -- so a viewer with, say, only
 * upcoming delegations still sees all three headings rather than the section silently vanishing. */
export function DelegationSections({ items }: { items: DelegationListItem[] }) {
  return (
    <div className="space-y-8">
      {SECTIONS.map((section) => {
        const rows = items.filter((i) => i.group === section.key);
        return (
          <section key={section.key} className="space-y-3">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {section.title} <span className="font-normal">({rows.length})</span>
            </h2>
            {rows.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                {section.emptyText}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {rows.map((item) => (
                  <DelegationCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
