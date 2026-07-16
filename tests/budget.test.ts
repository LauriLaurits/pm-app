import { describe, it, expect } from "vitest";
import {
  consumptionSeverity,
  CONSUMPTION_LABEL,
  CONSUMPTION_BADGE_CLASS,
  consumptionBadgeClasses,
  formatMoney,
  marginPct,
} from "@/lib/budget";

describe("consumptionSeverity", () => {
  it("74% is ok (just under the warn boundary)", () => {
    expect(consumptionSeverity(74)).toBe("ok");
  });

  it("75% is warn (lower boundary of warn)", () => {
    expect(consumptionSeverity(75)).toBe("warn");
  });

  it("89% is still warn (upper boundary of warn)", () => {
    expect(consumptionSeverity(89)).toBe("warn");
  });

  it("90% is high (lower boundary of high)", () => {
    expect(consumptionSeverity(90)).toBe("high");
  });

  it("99% is still high (upper boundary of high)", () => {
    expect(consumptionSeverity(99)).toBe("high");
  });

  it("100% is over (lower boundary of over)", () => {
    expect(consumptionSeverity(100)).toBe("over");
  });

  it("101% is over", () => {
    expect(consumptionSeverity(101)).toBe("over");
  });

  it("0% is ok", () => {
    expect(consumptionSeverity(0)).toBe("ok");
  });

  it("null is treated as ok (nothing consumed / no data)", () => {
    expect(consumptionSeverity(null)).toBe("ok");
  });
});

describe("CONSUMPTION_LABEL / CONSUMPTION_BADGE_CLASS", () => {
  it("has a label for every severity", () => {
    expect(CONSUMPTION_LABEL.ok).toBeTruthy();
    expect(CONSUMPTION_LABEL.warn).toBeTruthy();
    expect(CONSUMPTION_LABEL.high).toBeTruthy();
    expect(CONSUMPTION_LABEL.over).toBeTruthy();
  });

  it("has a distinct class per severity", () => {
    const classes = Object.values(CONSUMPTION_BADGE_CLASS);
    expect(new Set(classes).size).toBe(classes.length);
  });
});

describe("consumptionBadgeClasses", () => {
  it("returns a distinct class string per severity threshold", () => {
    const classes = [10, 80, 95, 130].map(consumptionBadgeClasses);
    expect(new Set(classes).size).toBe(4);
  });

  it("matches the exported class map", () => {
    expect(consumptionBadgeClasses(10)).toBe(CONSUMPTION_BADGE_CLASS.ok);
    expect(consumptionBadgeClasses(130)).toBe(CONSUMPTION_BADGE_CLASS.over);
  });
});

describe("formatMoney", () => {
  it("formats a positive amount as EUR with no decimals", () => {
    expect(formatMoney(15000)).toBe("€15,000");
  });

  it("formats null as an em dash", () => {
    expect(formatMoney(null)).toBe("—");
  });

  it("formats a negative amount (over budget) with a minus sign", () => {
    expect(formatMoney(-2000)).toBe("-€2,000");
  });

  it("formats zero as a real zero, not a dash", () => {
    expect(formatMoney(0)).toBe("€0");
  });
});

describe("marginPct", () => {
  it("computes margin percent of client amount", () => {
    expect(marginPct(10000, 15000)).toBeCloseTo(66.67, 2);
  });

  it("returns null when client amount is null", () => {
    expect(marginPct(10000, null)).toBe(null);
  });

  it("returns null when margin is null", () => {
    expect(marginPct(null, 15000)).toBe(null);
  });

  it("returns null when client amount is zero (avoid divide-by-zero)", () => {
    expect(marginPct(0, 0)).toBe(null);
  });
});
