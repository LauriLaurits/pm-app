import { describe, it, expect } from "vitest";
import { escapeIlike } from "@/lib/search";

describe("escapeIlike", () => {
  it("escapes % wildcard", () => {
    expect(escapeIlike("50%off")).toBe("50\\%off");
  });

  it("escapes _ wildcard", () => {
    expect(escapeIlike("a_b")).toBe("a\\_b");
  });

  it("doubles backslashes", () => {
    expect(escapeIlike("a\\b")).toBe("a\\\\b");
  });

  it("leaves normal text unchanged", () => {
    expect(escapeIlike("FinServ Grupp")).toBe("FinServ Grupp");
  });

  it("escapes backslash before % / _ escaping (order matters)", () => {
    expect(escapeIlike("100%_done\\now")).toBe("100\\%\\_done\\\\now");
  });
});
