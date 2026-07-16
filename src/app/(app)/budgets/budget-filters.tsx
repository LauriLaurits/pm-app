"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";
import { SEVERITY_FILTER_LABEL, SEVERITY_FILTER_OPTIONS } from "./types";
import type { SeverityFilter } from "./types";

export function BudgetFilters({ current }: { current: SeverityFilter }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setSeverity(value: SeverityFilter) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("severity");
    else params.set("severity", value);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={current} onValueChange={(v) => setSeverity(v as SeverityFilter)}>
        <SelectTrigger className="w-48">
          <SelectValue>{(v: string) => SEVERITY_FILTER_LABEL[v as SeverityFilter]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SEVERITY_FILTER_OPTIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {SEVERITY_FILTER_LABEL[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {current !== "all" && (
        <Button variant="ghost" size="sm" onClick={() => setSeverity("all")}>
          <XIcon /> Clear
        </Button>
      )}
    </div>
  );
}
