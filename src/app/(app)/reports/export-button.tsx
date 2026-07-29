"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BUDGET_STATUS_LABEL, type BudgetStatus } from "../budgets/types";
import type { PerformanceRow } from "./types";

const CSV_HEADERS = [
  "Project",
  "Client",
  "Budget",
  "Invoiced",
  "Cost",
  "Remaining",
  "Margin %",
  "Hours",
  "Billable %",
  "Status",
];

// BUDGET_STATUS_LABEL (budgets/types.ts) deliberately excludes "no_budget" -- it's never rendered
// as a badge in the UI (see that file's block comment: a null client_amount collapses "genuinely
// no budget" and "RLS-hidden from this viewer" into the same value). A CSV row has no such
// ambiguity issue since every row here already came from `budgetRows` the viewer could read, so
// "No budget" is a safe, honest label here even though the UI never shows it as one.
const STATUS_LABEL: Record<BudgetStatus, string> = { ...BUDGET_STATUS_LABEL, no_budget: "No budget" };

// Quotes a CSV cell only when it actually needs it (contains a comma, quote, or newline) --
// internal quotes are doubled per RFC 4180.
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Gated nulls (no budget/finance visibility on that row) render as an empty cell -- never a fake
// 0 -- same discipline as every gated compute.ts builder.
function numCell(n: number | null, digits: number): string {
  return n === null ? "" : n.toFixed(digits);
}

function buildCsv(rows: PerformanceRow[]): string {
  const lines = [CSV_HEADERS.map(csvCell).join(",")];
  for (const row of rows) {
    const cells = [
      row.name,
      row.clientName ?? "",
      numCell(row.budget, 2),
      numCell(row.invoiced, 2),
      numCell(row.cost, 2),
      numCell(row.remaining, 2),
      numCell(row.marginPct, 1),
      row.hoursLogged.toFixed(1),
      numCell(row.billablePct, 1),
      STATUS_LABEL[row.status],
    ];
    lines.push(cells.map(csvCell).join(","));
  }
  return lines.join("\n");
}

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
