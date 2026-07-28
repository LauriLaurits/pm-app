// Split out from dashboard-header.tsx so it can be unit tested without pulling in that
// component's client-component import graph (LogTimeDialog -> log-time-form.tsx -> a "use
// server" actions file -> lib/auth/session.ts's `server-only` guard trips under Vitest, which
// doesn't do Next's client/server bundle split).
export function greetingWord(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
