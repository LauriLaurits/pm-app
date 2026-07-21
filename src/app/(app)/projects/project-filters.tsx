"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarTint } from "@/lib/avatar-tint";
import {
  DERIVED_HEALTH_DOT, DERIVED_HEALTH_LABEL, type DerivedHealthLevel,
} from "@/lib/health";
import { BudgetTypeBadge } from "./budget-type-badge";
import {
  BUDGET_TYPE_OPTIONS, STATUS_DOT, STATUS_OPTIONS, humanize, initials,
} from "./types";

const ALL = "__all__";
const HEALTH_LEVELS: DerivedHealthLevel[] = ["healthy", "warning", "critical"];
const FILTER_KEYS = ["status", "health", "budget_type", "pm", "client", "q"];

export function ProjectFilters({
  pmOptions,
  clientOptions,
}: {
  pmOptions: { name: string; avatarUrl: string | null }[];
  clientOptions: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  // debounce the free-text search into the URL so every keystroke doesn't refetch
  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (q === current) return;
    const timeout = setTimeout(() => setParam("q", q || null), 300);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasActiveFilters = FILTER_KEYS.some((key) => searchParams.get(key));

  function clearAll() {
    setQ("");
    router.replace(pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Search projects or clients…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-64 rounded-full border-transparent bg-muted/60 shadow-none"
      />
      <Select
        value={searchParams.get("status") ?? ALL}
        onValueChange={(v) => setParam("status", v ?? null)}
      >
        <SelectTrigger className="rounded-full border-transparent bg-muted/60 shadow-none">
          <SelectValue>{(v: string) => (v === ALL ? "All statuses" : humanize(v))}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s}>
              <span className="flex items-center gap-2">
                <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[s]}`} />
                {humanize(s)}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={searchParams.get("health") ?? ALL}
        onValueChange={(v) => setParam("health", v ?? null)}
      >
        <SelectTrigger className="rounded-full border-transparent bg-muted/60 shadow-none">
          <SelectValue>
            {(v: string) =>
              v === ALL ? "All health" : DERIVED_HEALTH_LABEL[v as DerivedHealthLevel]
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All health</SelectItem>
          {HEALTH_LEVELS.map((h) => (
            <SelectItem key={h} value={h}>
              <span className="flex items-center gap-2">
                <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${DERIVED_HEALTH_DOT[h]}`} />
                {DERIVED_HEALTH_LABEL[h]}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={searchParams.get("budget_type") ?? ALL}
        onValueChange={(v) => setParam("budget_type", v ?? null)}
      >
        <SelectTrigger className="rounded-full border-transparent bg-muted/60 shadow-none">
          <SelectValue>{(v: string) => (v === ALL ? "All budget types" : humanize(v))}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All budget types</SelectItem>
          {BUDGET_TYPE_OPTIONS.map((b) => (
            <SelectItem key={b} value={b}>
              <BudgetTypeBadge type={b} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pmOptions.length > 0 && (
        <Select
          value={searchParams.get("pm") ?? ALL}
          onValueChange={(v) => setParam("pm", v ?? null)}
        >
          <SelectTrigger className="rounded-full border-transparent bg-muted/60 shadow-none">
            <SelectValue>{(v: string) => (v === ALL ? "All PMs" : v)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All PMs</SelectItem>
            {pmOptions.map((pm) => (
              <SelectItem key={pm.name} value={pm.name}>
                <span className="flex items-center gap-2">
                  <Avatar size="sm" className="size-5">
                    <AvatarImage src={pm.avatarUrl ?? undefined} alt={pm.name} />
                    <AvatarFallback className={`text-[9px] ${avatarTint(pm.name)}`}>
                      {initials(pm.name)}
                    </AvatarFallback>
                  </Avatar>
                  {pm.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {clientOptions.length > 0 && (
        <Select
          value={searchParams.get("client") ?? ALL}
          onValueChange={(v) => setParam("client", v ?? null)}
        >
          <SelectTrigger className="rounded-full border-transparent bg-muted/60 shadow-none">
            <SelectValue>{(v: string) => (v === ALL ? "All clients" : v)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All clients</SelectItem>
            {clientOptions.map((client) => (
              <SelectItem key={client} value={client}>
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`flex size-5 shrink-0 items-center justify-center rounded-md text-[9px] font-medium ${avatarTint(client)}`}
                  >
                    {initials(client)}
                  </span>
                  {client}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll}>
          <XIcon /> Clear
        </Button>
      )}
    </div>
  );
}
