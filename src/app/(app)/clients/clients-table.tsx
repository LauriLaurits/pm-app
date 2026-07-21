"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SortableHead } from "@/components/data-table/sortable-head";
import { useSort, type SortAccessors } from "@/components/data-table/use-sort";
import { ClientRowActions } from "./client-row-actions";
import type { ClientListRow } from "./types";

type SortKey = "name" | "contact" | "projects";

const ACCESSORS: SortAccessors<ClientListRow, SortKey> = {
  name: (r) => r.name,
  // Rows arrive primary-first from page.tsx, so [0] is the primary contact.
  contact: (r) => r.contacts[0]?.name ?? null,
  projects: (r) => r.project_count,
};

function matchesQuery(row: ClientListRow, query: string): boolean {
  if (row.name.toLowerCase().includes(query)) return true;
  return row.contacts.some(
    (c) =>
      c.name.toLowerCase().includes(query) ||
      (c.email !== null && c.email.toLowerCase().includes(query))
  );
}

export function ClientsTable({ rows, canManage }: { rows: ClientListRow[]; canManage: boolean }) {
  // Client-side search (list is small): client name, any contact name, any contact email.
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => matchesQuery(row, query));
  }, [rows, q]);
  const { rows: sorted, sort, toggle } = useSort(filtered, ACCESSORS, { key: "name", dir: "asc" });

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search clients or contacts…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-84 rounded-full border-transparent bg-muted/60 shadow-none"
      />
      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No clients match this search.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Client" sortKey="name" sort={sort} onToggle={toggle} />
              <SortableHead label="Contacts" sortKey="contact" sort={sort} onToggle={toggle} />
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
                <TableCell>
                  {row.contacts.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <div className="flex flex-col gap-0.5 py-0.5">
                      {row.contacts.map((c) => (
                        <span key={c.id} className="flex flex-wrap items-baseline gap-x-2">
                          {c.name}
                          {c.email && (
                            <span className="text-xs text-muted-foreground">{c.email}</span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.contacts[0]?.phone ?? "—"}
                </TableCell>
                <TableCell>
                  {row.project_count > 0 ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Link href={`/clients/${row.id}`} aria-label={`${row.name} projects`} />
                        }
                      >
                        <Badge variant="outline">{row.project_count}</Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="flex flex-col gap-0.5">
                          {row.project_names.map((name) => (
                            <span key={name}>{name}</span>
                          ))}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Badge variant="outline">0</Badge>
                  )}
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
      )}
    </div>
  );
}
