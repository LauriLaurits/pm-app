import { describe, it, expect } from "vitest";
import { greetingWord } from "@/app/(app)/dashboard/greeting";

describe("greetingWord", () => {
  it("is morning before noon", () => {
    expect(greetingWord(0)).toBe("morning");
    expect(greetingWord(11)).toBe("morning");
  });

  it("is afternoon from noon up to (not including) 18:00", () => {
    expect(greetingWord(12)).toBe("afternoon");
    expect(greetingWord(17)).toBe("afternoon");
  });

  it("is evening from 18:00 onward", () => {
    expect(greetingWord(18)).toBe("evening");
    expect(greetingWord(23)).toBe("evening");
  });
});
