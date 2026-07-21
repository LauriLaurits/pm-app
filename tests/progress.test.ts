import { describe, it, expect } from "vitest";
import { deriveProgress, progressBasisLabel, hoursOverrun } from "@/lib/progress";

describe("deriveProgress", () => {
  it("is null / 'none' basis when there are no parts", () => {
    const p = deriveProgress([]);
    expect(p.pct).toBeNull();
    expect(p.basis).toBe("none");
  });

  it("weights by estimated hours when estimates exist", () => {
    // 40 done of 95 total est. hours -> 42%
    const p = deriveProgress([
      { status: "done", estimated_hours: 40 },
      { status: "in_progress", estimated_hours: 30 },
      { status: "not_started", estimated_hours: 25 },
    ]);
    expect(p.basis).toBe("hours");
    expect(p.doneHours).toBe(40);
    expect(p.totalHours).toBe(95);
    expect(p.pct).toBe(42);
  });

  it("is 100% when every part is done", () => {
    const p = deriveProgress([
      { status: "done", estimated_hours: 10 },
      { status: "done", estimated_hours: 5 },
    ]);
    expect(p.pct).toBe(100);
  });

  it("is 0% when no part is done", () => {
    const p = deriveProgress([
      { status: "in_progress", estimated_hours: 10 },
      { status: "blocked", estimated_hours: 5 },
    ]);
    expect(p.pct).toBe(0);
  });

  it("falls back to part count when no part has an estimate", () => {
    const p = deriveProgress([
      { status: "done", estimated_hours: null },
      { status: "done", estimated_hours: null },
      { status: "not_started", estimated_hours: null },
    ]);
    expect(p.basis).toBe("count");
    expect(p.pct).toBe(67); // 2 of 3
  });

  it("counts a done part with a null estimate as 0 done-hours (hours basis still wins)", () => {
    // one estimated part (not done) + one done part with no estimate:
    // totalHours = 20 > 0 so hours basis; doneHours = 0 -> 0%
    const p = deriveProgress([
      { status: "not_started", estimated_hours: 20 },
      { status: "done", estimated_hours: null },
    ]);
    expect(p.basis).toBe("hours");
    expect(p.pct).toBe(0);
  });
});

describe("progressBasisLabel", () => {
  it("labels the hours basis", () => {
    expect(progressBasisLabel(deriveProgress([{ status: "done", estimated_hours: 40 }, { status: "not_started", estimated_hours: 55 }]))).toBe(
      "40 of 95 estimated hours"
    );
  });
  it("labels the count basis", () => {
    expect(
      progressBasisLabel(deriveProgress([{ status: "done", estimated_hours: null }, { status: "not_started", estimated_hours: null }]))
    ).toBe("1 of 2 parts");
  });
  it("labels the empty basis", () => {
    expect(progressBasisLabel(deriveProgress([]))).toBe("No parts yet");
  });
});

describe("hoursOverrun", () => {
  it("is neutral under or at estimate", () => {
    expect(hoursOverrun(30, 40)).toBe("none");
    expect(hoursOverrun(40, 40)).toBe("none");
  });
  it("warns just over estimate", () => {
    expect(hoursOverrun(42, 40)).toBe("warn"); // 105%
  });
  it("flags meaningfully over estimate", () => {
    expect(hoursOverrun(46, 35)).toBe("over"); // 131%
  });
  it("is neutral when there is no estimate to compare", () => {
    expect(hoursOverrun(10, null)).toBe("none");
    expect(hoursOverrun(10, 0)).toBe("none");
  });
});
