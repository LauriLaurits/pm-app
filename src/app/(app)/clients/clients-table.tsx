"use client";

import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SortableHead } from "@/components/data-table/sortable-head";
import { useSort, type SortAccessors } from "@/components/data-table/use-sort";
import { ClientRowActions } from "./client-row-actions";
import type { ClientListRow } from "./types";

type SortKey = "name" | "contact" | "projects";

const ACCESSORS: SortAccessors<ClientListRow, SortKey> = {
  name: (r) => r.name,
  contact: (r) => r.contact_name,
  projects: (r) => r.project_count,
};

export function ClientsTable({ rows, canManage }: { rows: ClientListRow[]; canManage: boolean }) {
  const { rows: sorted, sort, toggle } = useSort(rows, ACCESSORS, { key: "name", dir: "asc" });
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHead label="Client" sortKey="name" sort={sort} onToggle={toggle} />
          <SortableHead label="Contact" sortKey="contact" sort={sort} onToggle={toggle} />
          <TableHead>Email</TableHead>
          <TableHead>Phone</TableHead>
          <SortableHead label="Projects" sortKey="projects" sort={sort} onToggle={toggle} />
          {canManage && <TableHead className="text-right">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => (
          <TableRow key={row.id}>
            <TableCell>
              <Link href={`/clients/${row.id}`} className="font-medium hover:underline">
                {row.name}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">{row.contact_name ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">{row.contact_email ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">{row.phone ?? "—"}</TableCell>
            <TableCell>
              <Link href={`/clients/${row.id}`} aria-label={`${row.name} projects`}>
                <Badge variant="outline">{row.project_count}</Badge>
              </Link>
            </TableCell>
            {canManage && (
              <TableCell className="text-right">
                <ClientRowActions client={row} />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
