"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";
import { AVAILABILITY_LABEL, AVAILABILITY_OPTIONS } from "./types";

const ALL = "__all__";
const FILTER_KEYS = ["q", "department", "availability", "skill"];

export function PeopleFilters({
  departmentOptions,
  skillOptions,
}: {
  departmentOptions: string[];
  skillOptions: string[];
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
        placeholder="Search people or roles…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-64"
      />
      {departmentOptions.length > 0 && (
        <Select
          value={searchParams.get("department") ?? ALL}
          onValueChange={(v) => setParam("department", v ?? null)}
        >
          <SelectTrigger className="w-40">
            <SelectValue>{(v: string) => (v === ALL ? "All departments" : v)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All departments</SelectItem>
            {departmentOptions.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Select
        value={searchParams.get("availability") ?? ALL}
        onValueChange={(v) => setParam("availability", v ?? null)}
      >
        <SelectTrigger className="w-40">
          <SelectValue>
            {(v: string) => (v === ALL ? "All availability" : AVAILABILITY_LABEL[v as keyof typeof AVAILABILITY_LABEL])}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All availability</SelectItem>
          {AVAILABILITY_OPTIONS.map((a) => (
            <SelectItem key={a} value={a}>{AVAILABILITY_LABEL[a]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {skillOptions.length > 0 && (
        <Select
          value={searchParams.get("skill") ?? ALL}
          onValueChange={(v) => setParam("skill", v ?? null)}
        >
          <SelectTrigger className="w-40">
            <SelectValue>{(v: string) => (v === ALL ? "All skills" : v)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All skills</SelectItem>
            {skillOptions.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
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
