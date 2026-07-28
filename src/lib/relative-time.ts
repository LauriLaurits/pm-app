// Pure, "now"-anchored humanizer for timestamps in the dashboard's activity feed / feed items --
// same spirit as lib/dashboard.ts's date helpers (a caller can pass a fixed `now` for deterministic
// tests). Buckets: <60s "just now", <60min "N min ago", <24h "N h ago", <14d "N d ago", else falls
// back to a day-first short date ("28 Jul", en-GB, no year -- the feed never shows anything a year
// stale) so a months-old timestamp doesn't read as an absurd "312 d ago".

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const FALLBACK_DAYS = 14;

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = Math.max(0, now.getTime() - new Date(iso).getTime());

  if (diffMs < MINUTE_MS) return "just now";
  if (diffMs < HOUR_MS) return `${Math.floor(diffMs / MINUTE_MS)} min ago`;
  if (diffMs < DAY_MS) return `${Math.floor(diffMs / HOUR_MS)} h ago`;

  const days = Math.floor(diffMs / DAY_MS);
  if (days < FALLBACK_DAYS) return `${days} d ago`;

  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
