import { describe, it, expect } from "vitest";
import { decodeJwtSessionId } from "@/lib/auth/jwt";

function fakeJwt(payload: object): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.sig`;
}

describe("decodeJwtSessionId", () => {
  it("extracts session_id from a JWT payload", () => {
    expect(decodeJwtSessionId(fakeJwt({ session_id: "abc-123" }))).toBe("abc-123");
  });
  it("returns null for malformed tokens", () => {
    expect(decodeJwtSessionId("garbage")).toBeNull();
    expect(decodeJwtSessionId("a.!!!.c")).toBeNull();
    expect(decodeJwtSessionId(fakeJwt({}))).toBeNull();
  });
});
