import { describe, it, expect } from "vitest";
import { decideRedirect } from "@/lib/auth/gate";

const anon = { isAuthenticated: false, status: null } as const;
const pending = { isAuthenticated: true, status: "pending" } as const;
const active = { isAuthenticated: true, status: "active" } as const;
const disabled = { isAuthenticated: true, status: "disabled" } as const;

describe("decideRedirect", () => {
  it("lets unauthenticated users reach public auth pages", () => {
    expect(decideRedirect({ pathname: "/login", ...anon })).toBeNull();
    expect(decideRedirect({ pathname: "/signup", ...anon })).toBeNull();
    expect(decideRedirect({ pathname: "/auth/callback", ...anon })).toBeNull();
  });

  it("sends unauthenticated users to /login from protected routes", () => {
    expect(decideRedirect({ pathname: "/dashboard", ...anon })).toBe("/login");
    expect(decideRedirect({ pathname: "/", ...anon })).toBe("/login");
    expect(decideRedirect({ pathname: "/pending", ...anon })).toBe("/login");
  });

  it("locks pending users to /pending", () => {
    expect(decideRedirect({ pathname: "/pending", ...pending })).toBeNull();
    expect(decideRedirect({ pathname: "/dashboard", ...pending })).toBe("/pending");
    expect(decideRedirect({ pathname: "/admin/users", ...pending })).toBe("/pending");
  });

  it("keeps active users out of auth pages and off /pending", () => {
    expect(decideRedirect({ pathname: "/login", ...active })).toBe("/dashboard");
    expect(decideRedirect({ pathname: "/pending", ...active })).toBe("/dashboard");
    expect(decideRedirect({ pathname: "/", ...active })).toBe("/dashboard");
    expect(decideRedirect({ pathname: "/dashboard", ...active })).toBeNull();
    expect(decideRedirect({ pathname: "/settings/sessions", ...active })).toBeNull();
  });

  it("sends disabled users to /login with an error flag", () => {
    expect(decideRedirect({ pathname: "/dashboard", ...disabled })).toBe(
      "/login?error=account_disabled"
    );
    expect(decideRedirect({ pathname: "/login", ...disabled })).toBeNull();
  });

  it("locks pending users out of the auth callback route", () => {
    expect(decideRedirect({ pathname: "/auth/callback", ...pending })).toBe(
      "/pending"
    );
  });

  it("still flags disabled users on the auth callback route", () => {
    expect(decideRedirect({ pathname: "/auth/callback", ...disabled })).toBe(
      "/login?error=account_disabled"
    );
  });

  it("lets active users through the auth callback route", () => {
    expect(decideRedirect({ pathname: "/auth/callback", ...active })).toBeNull();
  });

  it("still flags disabled users on /pending", () => {
    expect(decideRedirect({ pathname: "/pending", ...disabled })).toBe(
      "/login?error=account_disabled"
    );
  });

  it("does not treat prefix-similar paths as public for unauthenticated users", () => {
    expect(decideRedirect({ pathname: "/loginfoo", ...anon })).toBe("/login");
    expect(decideRedirect({ pathname: "/authorize", ...anon })).toBe("/login");
  });

  it("lets active users through unknown protected-looking paths", () => {
    expect(decideRedirect({ pathname: "/loginfoo", ...active })).toBeNull();
  });
});
