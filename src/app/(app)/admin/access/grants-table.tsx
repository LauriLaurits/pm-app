import { PersonAvatar } from "@/components/person-avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RevokeGrantButton } from "./revoke-grant-button";
import { formatDate, humanize } from "./types";
import type { GrantListItem } from "./types";

/** Flat table of every ad-hoc grant the viewer (an admin) can see -- AccessFilters narrows it by
 * project/user via URL params for readability once the list grows. One row per (user, project,
 * permission) triple, matching the underlying user_project_permissions schema exactly (a single
 * "grant" in this UI's create form fans out into one row per selected permission). */
export function GrantsTable({ items }: { items: GrantListItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Project</TableHead>
          <TableHead>Permission</TableHead>
          <TableHead>Granted by</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>
              <div className="flex items-center gap-2">
                <PersonAvatar name={item.user_name} avatarUrl={item.user_avatar} className="size-8" />
                <span className="text-sm">{item.user_name}</span>
              </div>
            </TableCell>
            <TableCell className="text-sm">{item.project_name}</TableCell>
            <TableCell>
              <Badge variant="outline">{humanize(item.permission_key)}</Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{item.granted_by_name ?? "—"}</TableCell>
            <TableCell>
              {item.expires_at ? (
                <div className="flex items-center gap-1.5 text-sm">
                  <span className={item.isExpired ? "text-destructive" : undefined}>
                    {formatDate(item.expires_at)}
                  </span>
                  {item.isExpired && <Badge variant="destructive">Expired</Badge>}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">No expiry</span>
              )}
            </TableCell>
            <TableCell className="text-right">
              <RevokeGrantButton
                grantId={item.id}
                projectId={item.project_id}
                label={`${item.user_name} · ${humanize(item.permission_key)}`}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
