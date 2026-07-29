"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildCsv } from "./csv-export";
import type { PerformanceRow } from "./types";

// Client-side CSV export -- no server round trip. Builds the file from the SAME PerformanceRow[]
// the page already assembled server-side (no re-fetch), downloads via a throwaway Blob + <a>
// (the standard client-only download idiom -- no library needed for a plain CSV).
export function ExportButton({
  rows,
  startISO,
  endISO,
  label,
}: {
  rows: PerformanceRow[];
  startISO: string;
  endISO: string;
  /** The window's human date-range label (e.g. "1 Feb – 31 Jul 2026"), used only for the button's
   * accessible name -- the filename itself uses the raw ISO bounds. */
  label: string;
}) {
  function handleExport() {
    const csv = buildCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reports-${startISO}-${endISO}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} aria-label={`Export ${label} report as CSV`}>
      <Download />
      Export CSV
    </Button>
  );
}
