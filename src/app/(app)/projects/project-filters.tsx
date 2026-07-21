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

  // A chip with a value picked reads as ACTIVE: solid surface + border instead of the muted
  // wash, and its value renders with the same styling the option had in the list.
  const chip = (active: boolean) =>
    active
      ? "rounded-full border-border bg-background shadow-xs"
      : "rounded-full border-transparent bg-muted/60 shadow-none";
  const statusValue = searchParams.get("status");
  const healthValue = searchParams.get("health");
  const budgetValue = searchParams.get("budget_type");
  const pmValue = searchParams.get("pm");
  const clientValue = searchParams.get("client");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Search projects or clients…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-64 rounded-full border-transparent bg-muted/60 shadow-none"
      />
      <Select
        value={statusValue ?? ALL}
        onValueChange={(v) => setParam("status", v ?? null)}
      >
        <SelectTrigger className={chip(!!statusValue)}>
          <SelectValue>
            {(v: string) =>
              v === ALL ? (
                "All statuses"
              ) : (
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`size-1.5 shrink-0 rounded-full ${STATUS_DOT[v as (typeof STATUS_OPTIONS)[number]]}`}
                  />
                  {humanize(v)}
                </span>
              )
            }
          </SelectValue>
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
        value={healthValue ?? ALL}
        onValueChange={(v) => setParam("health", v ?? null)}
      >
        <SelectTrigger className={chip(!!healthValue)}>
          <SelectValue>
            {(v: string) =>
              v === ALL ? (
                "All health"
              ) : (
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`size-1.5 shrink-0 rounded-full ${DERIVED_HEALTH_DOT[v as DerivedHealthLevel]}`}
                  />
                  {DERIVED_HEALTH_LABEL[v as DerivedHealthLevel]}
                </span>
              )
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
        value={budgetValue ?? ALL}
        onValueChange={(v) => setParam("budget_type", v ?? null)}
      >
        <SelectTrigger className={chip(!!budgetValue)}>
          <SelectValue>
            {(v: string) =>
              v === ALL ? (
                "All budget types"
              ) : (
                <BudgetTypeBadge type={v as (typeof BUDGET_TYPE_OPTIONS)[number]} />
              )
            }
          </SelectValue>
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
          value={pmValue ?? ALL}
          onValueChange={(v) => setParam("pm", v ?? null)}
        >
          <SelectTrigger className={chip(!!pmValue)}>
            <SelectValue>
              {(v: string) => {
                if (v === ALL) return "All PMs";
                const pm = pmOptions.find((o) => o.name === v);
                return (
                  <span className="flex items-center gap-2">
                    <Avatar size="sm" className="size-5">
                      <AvatarImage src={pm?.avatarUrl ?? undefined} alt={v} />
                      <AvatarFallback className={`text-[9px] ${avatarTint(v)}`}>
                        {initials(v)}
                      </AvatarFallback>
                    </Avatar>
                    {v}
                  </span>
                );
              }}
            </SelectValue>
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
          value={clientValue ?? ALL}
          onValueChange={(v) => setParam("client", v ?? null)}
        >
          <SelectTrigger className={chip(!!clientValue)}>
            <SelectValue>
              {(v: string) =>
                v === ALL ? (
                  "All clients"
                ) : (
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`flex size-5 shrink-0 items-center justify-center rounded-md text-[9px] font-medium ${avatarTint(v)}`}
                    >
                      {initials(v)}
                    </span>
                    {v}
                  </span>
                )
              }
            </SelectValue>
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
