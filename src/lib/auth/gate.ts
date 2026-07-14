export type UserStatus = "pending" | "active" | "disabled";

export type GateInput = {
  pathname: string;
  isAuthenticated: boolean;
  status: UserStatus | null;
};

const PUBLIC_PREFIXES = ["/login", "/signup", "/auth"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/** Pure routing decision used by middleware. Returns a redirect target or null. */
export function decideRedirect(input: GateInput): string | null {
  const { pathname, isAuthenticated, status } = input;

  if (!isAuthenticated) {
    return isPublicPath(pathname) ? null : "/login";
  }
  if (status === "disabled") {
    return pathname === "/login" ? null : "/login?error=account_disabled";
  }
  if (status === "pending") {
    return pathname === "/pending" ? null : "/pending";
  }
  // active: the middleware maps missing/unreadable profile rows to
  // "pending" before calling this gate, so a null status here means
  // "verified active" or that the gate is being used outside middleware.
  if (isPublicPath(pathname) && !pathname.startsWith("/auth/")) return "/dashboard";
  if (pathname === "/pending" || pathname === "/") return "/dashboard";
  return null;
}
