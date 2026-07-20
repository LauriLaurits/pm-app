"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { XIcon } from "lucide-react";
import type { ProjectOption, UserOption } from "./types";

const ALL = "__all__";

/** URL-param filters (?project=&user=) over the grants list, same pattern as
 * ProjectFilters/BudgetFilters -- server-filtered in page.tsx, not client-side, so the list stays
 * correct even as the grant count grows past what's comfortable to filter in memory. */
export function AccessFilters({ projects, users }: { projects: ProjectOption[]; users: UserOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const hasActiveFilters = Boolean(searchParams.get("project") || searchParams.get("user"));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={searchParams.get("project") ?? ALL} onValueChange={(v) => setParam("project", v ?? null)}>
        <SelectTrigger className="w-48">
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
      <Select value={searchParams.get("user") ?? ALL} onValueChange={(v) => setParam("user", v ?? null)}>
        <SelectTrigger className="w-48">
          <SelectValue>
            {(v: string) => (v === ALL ? "All users" : (users.find((u) => u.user_id === v)?.full_name ?? v))}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All users</SelectItem>
          {users.map((u) => (
            <SelectItem key={u.user_id} value={u.user_id}>
              {u.full_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={() => router.replace(pathname)}>
          <XIcon /> Clear
        </Button>
      )}
    </div>
  );
}
