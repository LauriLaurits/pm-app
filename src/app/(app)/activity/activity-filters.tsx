"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { XIcon } from "lucide-react";
import { humanizeAction } from "./types";
import type { ProjectOption } from "./types";

const ALL = "__all__";
const FILTER_KEYS = ["actor", "action", "resource_type", "project", "from", "to"] as const;

/** Thin vertical rule between filter chips -- separates them without adding visual weight. */
function FilterDivider() {
  return <span aria-hidden className="h-4 w-px shrink-0 bg-border" />;
}

/** URL-param filters over /activity, same pattern as AccessFilters/BudgetFilters (server-filtered
 * in page.tsx). Any filter change also drops `page` back to the first page. */
export function ActivityFilters({
  actors,
  actions,
  resourceTypes,
  projects,
}: {
  actors: string[];
  actions: string[];
  resourceTypes: string[];
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  const hasActiveFilters = FILTER_KEYS.some((key) => searchParams.get(key));

  // A chip with a value picked reads as ACTIVE: solid surface + border instead of the muted
  // wash -- same idiom as ProjectFilters.
  const chip = (active: boolean) =>
    active
      ? "rounded-full border-border bg-background shadow-xs"
      : "rounded-full border-transparent bg-muted/60 shadow-none";
  const actorValue = searchParams.get("actor");
  const actionValue = searchParams.get("action");
  const resourceValue = searchParams.get("resource_type");
  const projectValue = searchParams.get("project");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={actorValue ?? ALL} onValueChange={(v) => setParam("actor", v)}>
        <SelectTrigger className={chip(!!actorValue)}>
          <SelectValue>{(v: string) => (v === ALL ? "All actors" : v)}</SelectValue>
        </SelectTrigger>
        <SelectContent className="min-w-52">
          <SelectItem value={ALL}>All actors</SelectItem>
          {actors.map((email) => (
            <SelectItem key={email} value={email}>
              {email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <FilterDivider />
      <Select value={actionValue ?? ALL} onValueChange={(v) => setParam("action", v)}>
        <SelectTrigger className={chip(!!actionValue)}>
          <SelectValue>{(v: string) => (v === ALL ? "All actions" : humanizeAction(v))}</SelectValue>
        </SelectTrigger>
        <SelectContent className="min-w-52">
          <SelectItem value={ALL}>All actions</SelectItem>
          {actions.map((action) => (
            <SelectItem key={action} value={action}>
              {humanizeAction(action)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <FilterDivider />
      <Select value={resourceValue ?? ALL} onValueChange={(v) => setParam("resource_type", v)}>
        <SelectTrigger className={chip(!!resourceValue)}>
          <SelectValue>{(v: string) => (v === ALL ? "All resources" : v)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All resources</SelectItem>
          {resourceTypes.map((type) => (
            <SelectItem key={type} value={type}>
              {type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {projects.length > 0 && (
        <>
          <FilterDivider />
          <Select value={projectValue ?? ALL} onValueChange={(v) => setParam("project", v)}>
            <SelectTrigger className={chip(!!projectValue)}>
              <SelectValue>
                {(v: string) => (v === ALL ? "All projects" : (projects.find((p) => p.id === v)?.name ?? v))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="min-w-52">
              <SelectItem value={ALL}>All projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}

      <FilterDivider />
      <Input
        type="date"
        aria-label="From date"
        className="w-36 rounded-full border-transparent bg-muted/60 shadow-none"
        value={searchParams.get("from") ?? ""}
        onChange={(e) => setParam("from", e.target.value || null)}
      />
      <span className="text-sm text-muted-foreground">to</span>
      <Input
        type="date"
        aria-label="To date"
        className="w-36 rounded-full border-transparent bg-muted/60 shadow-none"
        value={searchParams.get("to") ?? ""}
        onChange={(e) => setParam("to", e.target.value || null)}
      />

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.replace(pathname)}
          className="rounded-full bg-red-500/8 text-red-700 hover:bg-red-500/15 hover:text-red-800 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25"
        >
          <XIcon /> Clear filters
        </Button>
      )}
    </div>
  );
}
