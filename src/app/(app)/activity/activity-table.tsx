import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CATEGORY_STYLE,
  categoryOf,
  formatDateTime,
  humanizeAction,
  shortId,
  summarizeMetadata,
  truncate,
} from "./types";
import type { ActivityListItem } from "./types";

/** Read-only, newest-first table of audit_logs rows -- purely presentational, all filtering/
 * pagination happens server-side in page.tsx. Never renders the raw metadata jsonb (could be
 * large, and summarizeMetadata also strips anything sensitive-looking as a defense-in-depth
 * measure even though audit metadata never carries secrets by design). */
export function ActivityTable({ items }: { items: ActivityListItem[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Resource</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>IP</TableHead>
            <TableHead>Device</TableHead>
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const category = categoryOf(item.action);
            const style = CATEGORY_STYLE[category];
            const details = summarizeMetadata(item.metadata);
            return (
              <TableRow key={item.id}>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {formatDateTime(item.created_at)}
                </TableCell>
                <TableCell className="text-sm">{item.actor_email ?? "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={style.variant} className={style.className}>
                      {category}
                    </Badge>
                    <span className="text-sm">{humanizeAction(item.action)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {item.resource_type ?? "—"}
                  {item.resource_type && item.resource_id ? ` · ${shortId(item.resource_id)}` : null}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{item.project_name ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{item.ip ?? "—"}</TableCell>
                <TableCell className="max-w-48 truncate text-xs text-muted-foreground" title={item.user_agent ?? undefined}>
                  {truncate(item.user_agent) ?? "—"}
                </TableCell>
                <TableCell className="max-w-64 text-xs text-muted-foreground">{details ?? "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
