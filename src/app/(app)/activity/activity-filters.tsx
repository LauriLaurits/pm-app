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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={searchParams.get("actor") ?? ALL} onValueChange={(v) => setParam("actor", v)}>
        <SelectTrigger className="w-44">
          <SelectValue>{(v: string) => (v === ALL ? "All actors" : v)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All actors</SelectItem>
          {actors.map((email) => (
            <SelectItem key={email} value={email}>
              {email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("action") ?? ALL} onValueChange={(v) => setParam("action", v)}>
        <SelectTrigger className="w-44">
          <SelectValue>{(v: string) => (v === ALL ? "All actions" : humanizeAction(v))}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All actions</SelectItem>
          {actions.map((action) => (
            <SelectItem key={action} value={action}>
              {humanizeAction(action)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={searchParams.get("resource_type") ?? ALL} onValueChange={(v) => setParam("resource_type", v)}>
        <SelectTrigger className="w-40">
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
        <Select value={searchParams.get("project") ?? ALL} onValueChange={(v) => setParam("project", v)}>
          <SelectTrigger className="w-44">
            <SelectValue>
              {(v: string) => (v === ALL ? "All projects" : (projects.find((p) => p.id === v)?.name ?? v))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Input
        type="date"
        aria-label="From date"
        className="w-36"
        value={searchParams.get("from") ?? ""}
        onChange={(e) => setParam("from", e.target.value || null)}
      />
      <span className="text-sm text-muted-foreground">to</span>
      <Input
        type="date"
        aria-label="To date"
        className="w-36"
        value={searchParams.get("to") ?? ""}
        onChange={(e) => setParam("to", e.target.value || null)}
      />

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={() => router.replace(pathname)}>
          <XIcon /> Clear
        </Button>
      )}
    </div>
  );
}
