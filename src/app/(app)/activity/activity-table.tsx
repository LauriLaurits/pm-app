"use client";

import { useState } from "react";
import Link from "next/link";
import { Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { avatarTint } from "@/lib/avatar-tint";
import {
  CATEGORY_STYLE,
  categoryOf,
  emailInitials,
  emailNamePart,
  formatDateTime,
  humanizeAction,
  shortId,
  truncate,
} from "./types";
import type { SafeActivityItem } from "./types";

const OPTIONAL_COLUMNS = [
  { key: "ip", label: "IP" },
  { key: "device", label: "Device" },
] as const;
type ColumnKey = (typeof OPTIONAL_COLUMNS)[number]["key"];

/** Read-only, newest-first table of audit_logs rows -- purely presentational, all filtering/
 * pagination happens server-side in page.tsx. This is a "use client" component (needed for the
 * IP/Device column-visibility gear's local state), so its whole `items` prop serializes into the
 * RSC flight payload -- `items` is SafeActivityItem[], an explicit allowlist built server-side in
 * page.tsx, NOT a spread of the full audit_logs row. In particular `details` is always the
 * summarizeMetadata() STRING; the raw metadata jsonb never reaches this file. */
export function ActivityTable({ items }: { items: SafeActivityItem[] }) {
  // IP and Device are hidden by default -- re-showable via the gear, same idiom as
  // ProjectsTable's column-visibility menu.
  const [hidden, setHidden] = useState<Set<ColumnKey>>(() => new Set(["ip", "device"]));
  const show = (key: ColumnKey) => !hidden.has(key);

  return (
    <div className="overflow-x-auto">
      <Table className="[&_tbody_td]:py-2.5">
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Resource</TableHead>
            <TableHead>Project</TableHead>
            {show("ip") && <TableHead>IP</TableHead>}
            {show("device") && <TableHead>Device</TableHead>}
            <TableHead>Details</TableHead>
            <TableHead className="w-10 text-right">
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Configure columns"
                  className="rounded p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2"
                >
                  <Settings2 className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {/* base-ui gotcha: DropdownMenuLabel throws unless wrapped in a group. */}
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Columns</DropdownMenuLabel>
                  </DropdownMenuGroup>
                  {OPTIONAL_COLUMNS.map((c) => (
                    <DropdownMenuCheckboxItem
                      key={c.key}
                      checked={show(c.key)}
                      onCheckedChange={() =>
                        setHidden((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.key)) next.delete(c.key);
                          else next.add(c.key);
                          return next;
                        })
                      }
                    >
                      {c.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const category = categoryOf(item.action);
            const style = CATEGORY_STYLE[category];
            const namePart = item.actor_email ? emailNamePart(item.actor_email) : null;
            return (
              <TableRow key={item.id}>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {formatDateTime(item.created_at)}
                </TableCell>
                <TableCell>
                  {namePart ? (
                    <span className="flex items-center gap-2" title={item.actor_email ?? undefined}>
                      <span
                        aria-hidden
                        className={`flex size-5 shrink-0 items-center justify-center rounded-md text-[9px] font-medium ${avatarTint(namePart)}`}
                      >
                        {emailInitials(namePart)}
                      </span>
                      <span className="text-sm">{namePart}</span>
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
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
                <TableCell className="text-sm text-muted-foreground">
                  {item.project_name ? (
                    item.project_id ? (
                      <Link href={`/projects/${item.project_id}`} className="hover:underline">
                        {item.project_name}
                      </Link>
                    ) : (
                      item.project_name
                    )
                  ) : (
                    "—"
                  )}
                </TableCell>
                {show("ip") && (
                  <TableCell className="font-mono text-xs text-muted-foreground">{item.ip ?? "—"}</TableCell>
                )}
                {show("device") && (
                  <TableCell
                    className="max-w-48 truncate text-xs text-muted-foreground"
                    title={item.user_agent ?? undefined}
                  >
                    {truncate(item.user_agent) ?? "—"}
                  </TableCell>
                )}
                <TableCell className="max-w-64 text-xs text-muted-foreground">{item.details ?? "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
