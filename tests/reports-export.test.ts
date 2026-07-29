import { describe, it, expect } from "vitest";
import { csvCell, csvNumberCell } from "@/lib/csv";
import { buildCsv } from "@/app/(app)/reports/csv-export";
import type { PerformanceRow } from "@/app/(app)/reports/types";

// Formula-injection guard: a cell whose first character is one of these is a live-formula trigger
// in Excel/Sheets/LibreOffice (data exfil via =HYPERLINK(...), DDE exec via =cmd|'...'!A0, etc).
// Project/client name zod schemas place no character restriction on the value, so any of these are
// legitimate, valid names today -- csvCell must neutralize every one of them.
describe("csvCell -- formula-injection guard", () => {
  it.each(["=cmd|' /C calc'!A0", "+1+1", "-2+3", "@SUM(A1:A9)", "\tsneaky", "\rsneaky"])(
    "prefixes a leading quote when the value starts with a formula-trigger character (%s)",
    (value) => {
      const escaped = csvCell(value);
      expect(escaped.startsWith("'")).toBe(true);
      // The original value must still be recoverable after the leading guard quote -- never
      // silently dropped or mangled.
      expect(escaped.slice(1)).toBe(value);
    }
  );

  it("leaves a normal name unchanged", () => {
    expect(csvCell("Retail e-shop replatform")).toBe("Retail e-shop replatform");
  });

  it("still RFC-4180-quotes a comma/quote-bearing value, on top of the formula guard", () => {
    // Comma alone (no formula trigger) -> wrapped in quotes, no injection prefix.
    expect(csvCell("Acme, Inc.")).toBe('"Acme, Inc."');
    // Internal quotes doubled.
    expect(csvCell('Say "hi"')).toBe('"Say ""hi"""');
    // Formula trigger AND a comma -> guarded first, then quoted (comma forces the wrap; the
    // leading `'` is now safely inside the quoted field).
    expect(csvCell("=A1,B1")).toBe(`"'=A1,B1"`);
  });

  it("round-trips a value with a newline via quoting", () => {
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("csvNumberCell -- never runs through the formula guard", () => {
  it("renders null as an empty cell, never a fake 0", () => {
    expect(csvNumberCell(null, 2)).toBe("");
  });

  it("renders a legitimate negative number as a plain numeric string, no quote prefix", () => {
    // A leading "-" IS a formula-trigger character, but numeric cells are program-generated
    // (toFixed) and must import as NUMBERS, not text -- csvNumberCell must never guard them.
    expect(csvNumberCell(-2000, 2)).toBe("-2000.00");
  });

  it("formats to the requested precision", () => {
    expect(csvNumberCell(1234.5, 1)).toBe("1234.5");
  });
});

function row(overrides: Partial<PerformanceRow>): PerformanceRow {
  return {
    id: "p1",
    name: "Normal Project",
    clientName: "Normal Client",
    budget: 1000,
    invoiced: 500,
    invoicedPct: 50,
    cost: 200,
    costPct: 20,
    remaining: 500,
    marginPct: 30,
    hoursLogged: 10,
    billablePct: 80,
    status: "on_track",
    ...overrides,
  };
}

describe("buildCsv -- end-to-end row building", () => {
  it("neutralizes a malicious project/client name so the exported cell can't execute as a formula", () => {
    const csv = buildCsv([
      row({ name: "=cmd|' /C calc'!A0", clientName: "+SUM(A1:A9)" }),
    ]);
    const [, dataLine] = csv.split("\n");
    const cells = dataLine.split(",");
    expect(cells[0].startsWith("'=cmd")).toBe(true);
    expect(cells[1].startsWith("'+SUM")).toBe(true);
  });

  it("leaves a normal row's values unchanged and gates nulls as empty cells", () => {
    const csv = buildCsv([
      row({
        name: "Retail e-shop replatform",
        clientName: null,
        budget: null,
        invoiced: null,
        cost: null,
        remaining: null,
        marginPct: null,
        billablePct: null,
        status: "no_budget",
      }),
    ]);
    const [header, dataLine] = csv.split("\n");
    expect(header).toBe("Project,Client,Budget,Invoiced,Cost,Remaining,Margin %,Hours,Billable %,Status");
    expect(dataLine).toBe("Retail e-shop replatform,,,,,,,10.0,,No budget");
  });
});
