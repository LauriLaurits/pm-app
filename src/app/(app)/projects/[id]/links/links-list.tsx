import { ExternalLinkIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { humanize } from "../../types";
import { LinkDeleteButton } from "./link-actions";
import { LinkFormDialog } from "./link-form-dialog";
import type { LinkRow } from "./types";

const VISIBILITY_BADGE: Record<LinkRow["visibility"], "outline" | "secondary" | "destructive"> = {
  project: "outline",
  pm_only: "secondary",
  admins_only: "destructive",
};

/** Grouped by link type -- RLS already narrowed `links` to what this caller may see
 * (project/pm_only/admins_only tiers), so grouping here is display-only, never a filter. */
function groupByType(links: LinkRow[]) {
  const groups = new Map<LinkRow["type"], LinkRow[]>();
  for (const link of links) groups.set(link.type, [...(groups.get(link.type) ?? []), link]);
  return [...groups.entries()];
}

export function LinksList({
  links,
  projectId,
  canManage,
}: {
  links: LinkRow[];
  projectId: string;
  canManage: boolean;
}) {
  if (links.length === 0) {
    return <p className="text-muted-foreground">No links visible to you on this project yet.</p>;
  }

  return (
    <div className="space-y-6">
      {groupByType(links).map(([type, group]) => (
        <div key={type} className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">{humanize(type)}</h3>
          <div className="space-y-2">
            {group.map((link) => (
              <div key={link.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 font-medium hover:underline"
                    >
                      {link.name}
                      <ExternalLinkIcon className="size-3.5 text-muted-foreground" />
                    </a>
                    {link.environment && <Badge variant="outline">{link.environment}</Badge>}
                    <Badge variant={VISIBILITY_BADGE[link.visibility]}>{humanize(link.visibility)}</Badge>
                  </div>
                  {link.description && <p className="text-xs text-muted-foreground">{link.description}</p>}
                  {link.owner_name && <p className="text-xs text-muted-foreground">Owner: {link.owner_name}</p>}
                </div>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-2">
                    <LinkFormDialog projectId={projectId} link={link} />
                    <LinkDeleteButton projectId={projectId} link={link} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
