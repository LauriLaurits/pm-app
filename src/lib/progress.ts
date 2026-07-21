// Project progress is DERIVED, never hand-typed. It answers "how much of the planned work is
// done" from the parts a PM already maintains -- flip a part to `done` and progress moves. This
// keeps the number honest (the old manual `progress` %, backed by nothing, is gone from the UI).
//
// Basis, in order of preference:
//   - "hours": share of estimated hours that sits in done parts (Σ done est-hrs / Σ est-hrs).
//     The right measure when parts are estimated -- a 40h part completing counts more than a 2h one.
//   - "count": share of parts marked done, used only when NO part has an estimate (can't weight).
//   - "none": the project has no parts at all -> pct is null ("No parts yet"), never a fake 0%.

export type ProgressPart = { status: string; estimated_hours: number | null };

export type DerivedProgress = {
  pct: number | null;
  basis: "hours" | "count" | "none";
  doneHours: number;
  totalHours: number;
  donePartCount: number;
  totalPartCount: number;
};

export function deriveProgress(parts: ProgressPart[]): DerivedProgress {
  const totalPartCount = parts.length;
  if (totalPartCount === 0) {
    return { pct: null, basis: "none", doneHours: 0, totalHours: 0, donePartCount: 0, totalPartCount: 0 };
  }

  const done = parts.filter((p) => p.status === "done");
  const donePartCount = done.length;
  const totalHours = parts.reduce((sum, p) => sum + (p.estimated_hours ?? 0), 0);
  const doneHours = done.reduce((sum, p) => sum + (p.estimated_hours ?? 0), 0);

  if (totalHours > 0) {
    return {
      pct: Math.round((doneHours / totalHours) * 100),
      basis: "hours",
      doneHours,
      totalHours,
      donePartCount,
      totalPartCount,
    };
  }

  return {
    pct: Math.round((donePartCount / totalPartCount) * 100),
    basis: "count",
    doneHours: 0,
    totalHours: 0,
    donePartCount,
    totalPartCount,
  };
}

// A short human label for the progress basis, shown with the bar: "40 of 95 estimated hours"
// or "3 of 7 parts" or "No parts yet".
export function progressBasisLabel(p: DerivedProgress): string {
  if (p.basis === "none") return "No parts yet";
  if (p.basis === "hours") return `${round1(p.doneHours)} of ${round1(p.totalHours)} estimated hours`;
  return `${p.donePartCount} of ${p.totalPartCount} parts`;
}

// How a part's ACTUAL logged hours compare to its estimate -- drives the amber/red hours cell in
// the parts table. "warn" once over estimate, "over" once meaningfully (>15%) over. Neutral when
// there's no estimate to compare against (can't judge over/under).
export function hoursOverrun(actual: number, estimated: number | null): "none" | "warn" | "over" {
  if (!estimated || estimated <= 0) return "none";
  const ratio = actual / estimated;
  if (ratio > 1.15) return "over";
  if (ratio > 1) return "warn";
  return "none";
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
