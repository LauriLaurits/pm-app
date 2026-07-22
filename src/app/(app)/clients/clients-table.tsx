"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DotBadge } from "@/components/dot-badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SortableHead } from "@/components/data-table/sortable-head";
import { useSort, type SortAccessors } from "@/components/data-table/use-sort";
import { avatarTint } from "@/lib/avatar-tint";
import { initials } from "../projects/types";
import { ClientRowActions } from "./client-row-actions";
import type { ClientContactRow, ClientListRow } from "./types";

const PAGE_SIZE = 10;

type SortKey = "name" | "contact" | "projects";

const ACCESSORS: SortAccessors<ClientListRow, SortKey> = {
  name: (r) => r.name,
  // Rows arrive primary-first from page.tsx, so [0] is the primary contact.
  contact: (r) => r.contacts[0]?.name ?? null,
  projects: (r) => r.active_count,
};

// The only client-side facet the schema supports (clients have no status/industry/PM fields):
// with vs without currently-active projects.
type ActivityFilter = "all" | "with" | "without";
const ACTIVITY_LABEL: Record<ActivityFilter, string> = {
  all: "All clients",
  with: "With active projects",
  without: "Without active projects",
};
const ACTIVITY_OPTIONS: ActivityFilter[] = ["all", "with", "without"];

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
  const [activity, setActivity] = useState<ActivityFilter>("all");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (query && !matchesQuery(row, query)) return false;
      if (activity === "with") return row.active_count > 0;
      if (activity === "without") return row.active_count === 0;
      return true;
    });
  }, [rows, q, activity]);
  const { rows: sorted, sort, toggle } = useSort(filtered, ACCESSORS, { key: "name", dir: "asc" });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Same chip language as the projects filters: muted wash at rest, solid surface when active.
  const chip = (active: boolean) =>
    active
      ? "rounded-full border-border bg-background shadow-xs"
      : "rounded-full border-transparent bg-muted/60 shadow-none";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search clients, contacts or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="mr-3 w-84 rounded-full border-transparent bg-muted/60 shadow-none"
        />
        <Select
          value={activity}
          onValueChange={(v) => setActivity((v as ActivityFilter) ?? "all")}
        >
          <SelectTrigger className={chip(activity !== "all")}>
            <SelectValue>{(v: ActivityFilter) => ACTIVITY_LABEL[v]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ACTIVITY_OPTIONS.map((o) => (
              <SelectItem key={o} value={o}>
                {ACTIVITY_LABEL[o]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No clients match your filters.
        </div>
      ) : (
        <div className="space-y-2">
          <Table className="[&_tbody_td]:py-4">
            <TableHeader>
              <TableRow>
                <SortableHead label="Client" sortKey="name" sort={sort} onToggle={toggle} />
                <SortableHead label="Contacts" sortKey="contact" sort={sort} onToggle={toggle} />
                <SortableHead label="Projects" sortKey="projects" sort={sort} onToggle={toggle} />
                <TableHead className="w-10 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => (
                <TableRow key={row.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className={`flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-medium ${avatarTint(row.name)}`}
                      >
                        {initials(row.name)}
                      </span>
                      <div className="min-w-0">
                        <Link
                          href={`/clients/${row.id}`}
                          className="text-base leading-tight font-semibold transition-opacity hover:opacity-70"
                        >
                          {row.name}
                        </Link>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {row.contacts.length} contact{row.contacts.length === 1 ? "" : "s"}
                          <span className="mx-1 text-border">·</span>
                          {row.active_count} active project{row.active_count === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <ContactsCell contacts={row.contacts} />
                  </TableCell>
                  <TableCell>
                    <ProjectsCell row={row} />
                  </TableCell>
                  <TableCell className="text-right">
                    <ClientRowActions client={row} canManage={canManage} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
            <span>
              Showing {sorted.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1} to{" "}
              {Math.min(currentPage * PAGE_SIZE, sorted.length)} of {sorted.length} client
              {sorted.length === 1 ? "" : "s"}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeft />
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Button
                    key={p}
                    variant={p === currentPage ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight />
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// One mini-row per contact: tinted initials chip + name (role muted after it), email/phone
// muted underneath. Primary sorts first (page.tsx orders the read).
function ContactsCell({ contacts }: { contacts: ClientContactRow[] }) {
  if (contacts.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col gap-1.5">
      {contacts.map((c) => (
        <div key={c.id} className="flex items-start gap-2">
          <span
            aria-hidden
            className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md text-[9px] font-medium ${avatarTint(c.name)}`}
          >
            {initials(c.name)}
          </span>
          <div className="min-w-0 leading-tight">
            <div className="text-sm">
              {c.name}
              {c.role && <span className="ml-1.5 text-xs text-muted-foreground">{c.role}</span>}
            </div>
            {(c.email || c.phone) && (
              <div className="text-xs text-muted-foreground">
                {[c.email, c.phone].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// "N active" in the shared DotBadge language (emerald dot -- same as project status Active);
// muted 0 otherwise. The hover tooltip lists every visible project name for the client.
function ProjectsCell({ row }: { row: ClientListRow }) {
  const badge =
    row.active_count > 0 ? (
      <DotBadge dotClassName="bg-emerald-500" className="tabular-nums">
        {row.active_count} active
      </DotBadge>
    ) : (
      <span className="text-sm text-muted-foreground tabular-nums">0</span>
    );
  if (row.project_names.length === 0) return badge;
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Link href={`/clients/${row.id}`} aria-label={`${row.name} projects`} />}
      >
        {badge}
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex flex-col gap-0.5">
          {row.project_names.map((name) => (
            <span key={name}>{name}</span>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
