import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "@/lib/relative-time";

const NOW = new Date("2026-07-28T12:00:00Z");

function isoSecondsAgo(seconds: number): string {
  return new Date(NOW.getTime() - seconds * 1000).toISOString();
}

describe("formatRelativeTime", () => {
  it("30s ago reads as 'just now'", () => {
    expect(formatRelativeTime(isoSecondsAgo(30), NOW)).toBe("just now");
  });

  it("59s ago is still 'just now' (upper boundary)", () => {
    expect(formatRelativeTime(isoSecondsAgo(59), NOW)).toBe("just now");
  });

  it("12 minutes ago", () => {
    expect(formatRelativeTime(isoSecondsAgo(12 * 60), NOW)).toBe("12 min ago");
  });

  it("59 minutes ago is still minutes (upper boundary)", () => {
    expect(formatRelativeTime(isoSecondsAgo(59 * 60), NOW)).toBe("59 min ago");
  });

  it("2 hours ago", () => {
    expect(formatRelativeTime(isoSecondsAgo(2 * 3600), NOW)).toBe("2 h ago");
  });

  it("23 hours ago is still hours (upper boundary)", () => {
    expect(formatRelativeTime(isoSecondsAgo(23 * 3600), NOW)).toBe("23 h ago");
  });

  it("3 days ago", () => {
    expect(formatRelativeTime(isoSecondsAgo(3 * 86400), NOW)).toBe("3 d ago");
  });

  it("13 days ago is still days (upper boundary)", () => {
    expect(formatRelativeTime(isoSecondsAgo(13 * 86400), NOW)).toBe("13 d ago");
  });

  it("20 days ago falls back to a day-first date ('8 Jul' style)", () => {
    expect(formatRelativeTime(isoSecondsAgo(20 * 86400), NOW)).toBe("8 Jul");
  });

  it("defaults `now` to the current time when omitted", () => {
    const almostNow = new Date(Date.now() - 5000).toISOString();
    expect(formatRelativeTime(almostNow)).toBe("just now");
  });
});
