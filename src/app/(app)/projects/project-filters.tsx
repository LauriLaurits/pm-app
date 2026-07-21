"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";
import {
  BUDGET_TYPE_OPTIONS, STATUS_OPTIONS, humanize,
} from "./types";

const ALL = "__all__";
// No health filter: health is derived at render time (lib/health.ts), so the stored column the
// server-side filter would need is meaningless -- sort the Health column instead.
const FILTER_KEYS = ["status", "budget_type", "pm", "client", "q"];

export function ProjectFilters({
  pmOptions,
  clientOptions,
}: {
  pmOptions: string[];
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
        <SelectTrigger className="rounded-full border-transparent bg-muted/60 shadow-none w-36">
          <SelectValue>{(v: string) => (v === ALL ? "All statuses" : humanize(v))}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s}>{humanize(s)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={searchParams.get("budget_type") ?? ALL}
        onValueChange={(v) => setParam("budget_type", v ?? null)}
      >
        <SelectTrigger className="rounded-full border-transparent bg-muted/60 shadow-none w-36">
          <SelectValue>{(v: string) => (v === ALL ? "All budget types" : humanize(v))}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All budget types</SelectItem>
          {BUDGET_TYPE_OPTIONS.map((b) => (
            <SelectItem key={b} value={b}>{humanize(b)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pmOptions.length > 0 && (
        <Select
          value={searchParams.get("pm") ?? ALL}
          onValueChange={(v) => setParam("pm", v ?? null)}
        >
          <SelectTrigger className="rounded-full border-transparent bg-muted/60 shadow-none w-40">
            <SelectValue>{(v: string) => (v === ALL ? "All PMs" : v)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All PMs</SelectItem>
            {pmOptions.map((pm) => (
              <SelectItem key={pm} value={pm}>{pm}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {clientOptions.length > 0 && (
        <Select
          value={searchParams.get("client") ?? ALL}
          onValueChange={(v) => setParam("client", v ?? null)}
        >
          <SelectTrigger className="rounded-full border-transparent bg-muted/60 shadow-none w-40">
            <SelectValue>{(v: string) => (v === ALL ? "All clients" : v)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All clients</SelectItem>
            {clientOptions.map((client) => (
              <SelectItem key={client} value={client}>{client}</SelectItem>
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
