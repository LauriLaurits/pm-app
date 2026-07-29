// Plain (non-"use client") CSV row-building for the reports export -- pure, no React/DOM, unit-
// tested directly (tests/reports-export.test.ts). Kept out of export-button.tsx itself so this
// domain mapping (which PerformanceRow field goes in which column) can be imported by a plain
// vitest module without dragging in the "use client" component tree (Button/lucide-react).
import { csvCell, csvNumberCell } from "@/lib/csv";
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

// csvCell (formula-injection guard + RFC-4180 quoting, src/lib/csv.ts) is used for every STRING
// column below (name, clientName, status label) -- those carry free-text user input (project/
// client names have no character restriction in their zod schemas) and MUST be neutralized against
// a leading =/+/-/@/tab/CR before they reach a spreadsheet app. csvNumberCell is used for every
// numeric column and is deliberately NOT run through the formula guard -- those cells are
// program-generated (toFixed) and a legitimate negative figure (e.g. "-2000.00") must still import
// as a number, not text (see src/lib/csv.ts's own comment on why the two must never be mixed).
export function buildCsv(rows: PerformanceRow[]): string {
  const lines = [CSV_HEADERS.map(csvCell).join(",")];
  for (const row of rows) {
    const cells = [
      csvCell(row.name),
      csvCell(row.clientName ?? ""),
      csvNumberCell(row.budget, 2),
      csvNumberCell(row.invoiced, 2),
      csvNumberCell(row.cost, 2),
      csvNumberCell(row.remaining, 2),
      csvNumberCell(row.marginPct, 1),
      row.hoursLogged.toFixed(1),
      csvNumberCell(row.billablePct, 1),
      csvCell(STATUS_LABEL[row.status]),
    ];
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}
