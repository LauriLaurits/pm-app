import type { Database } from "@/lib/database.types";

export type AuditLogRow = Database["public"]["Tables"]["audit_logs"]["Row"];

export type ProjectOption = { id: string; name: string };

/** One page's worth of audit_logs rows, enriched with a best-effort project name. */
export type ActivityListItem = AuditLogRow & {
  project_name: string | null;
};

export const PAGE_SIZE = 50;

/** Coarse buckets for the colored action tag -- derived from the action's suffix, not a hardcoded
 * per-action map, so a new AuditAction (src/lib/audit.ts) picks up a sensible color for free. */
export type ActionCategory = "auth" | "create" | "update" | "delete" | "reveal" | "other";

const CREATE_SUFFIXES = ["created", "added", "granted", "approved", "upserted", "logged", "signup"];
const UPDATE_SUFFIXES = ["updated", "changed", "copied"];
const DELETE_SUFFIXES = ["deleted", "removed", "revoked", "archived"];
const REVEAL_SUFFIXES = ["revealed"];

export function categoryOf(action: string): ActionCategory {
  if (action.startsWith("auth.") || action.startsWith("session.")) return "auth";
  const suffix = action.split(".").at(-1) ?? "";
  if (REVEAL_SUFFIXES.includes(suffix)) return "reveal";
  if (DELETE_SUFFIXES.includes(suffix)) return "delete";
  if (CREATE_SUFFIXES.includes(suffix)) return "create";
  if (UPDATE_SUFFIXES.includes(suffix)) return "update";
  return "other";
}

/** Badge variant + extra classes per category -- reuses the existing Badge component rather than
 * inventing a new color system (amber "reveal" styling matches the credentials list's expiry tag). */
export const CATEGORY_STYLE: Record<ActionCategory, { variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
  auth: { variant: "outline" },
  create: { variant: "secondary" },
  update: { variant: "outline" },
  delete: { variant: "destructive" },
  reveal: {
    variant: "outline",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-400",
  },
  other: { variant: "outline" },
};

export function humanizeAction(action: string) {
  const [resource, verb] = action.split(".");
  const words = `${resource ?? action} ${verb ?? ""}`.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function humanize(value: string) {
  return value.replace(/_/g, " ");
}

export function shortId(value: string | null) {
  if (!value) return "—";
  return value.length > 10 ? `${value.slice(0, 8)}…` : value;
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function truncate(value: string | null, max = 48) {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Keys that would never legitimately appear in audit metadata (by design nothing secret is ever
 * written there -- see writeAudit call sites) but are stripped defensively so a future caller's
 * mistake can't surface a secret on this read-only viewer. */
const SENSITIVE_KEY_PATTERN = /secret|password|token|plaintext/i;

/** Compact "key: value, key: value" summary of a handful of metadata fields -- never the raw
 * jsonb blob (some metadata objects carry long arrays), and never a sensitive-looking key. */
export function summarizeMetadata(metadata: unknown, max = 4): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const entries = Object.entries(metadata as Record<string, unknown>).filter(
    ([key, value]) => value !== null && value !== undefined && !SENSITIVE_KEY_PATTERN.test(key),
  );
  if (entries.length === 0) return null;
  const shown = entries.slice(0, max).map(([key, value]) => `${humanize(key)}: ${stringifyValue(value)}`);
  const suffix = entries.length > max ? ` +${entries.length - max} more` : "";
  return shown.join(", ") + suffix;
}

/** Best-effort project id for a row: project.* actions store it as resource_id directly; anything
 * else that resolves to a project stores it under metadata.project_id (see writeAudit call sites
 * across src/app/actions/*). Returns null when neither is present. */
export function resolveProjectId(row: Pick<AuditLogRow, "metadata" | "resource_type" | "resource_id">): string | null {
  const metadataProjectId =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>).project_id
      : undefined;
  if (typeof metadataProjectId === "string") return metadataProjectId;
  if (row.resource_type === "project" && row.resource_id) return row.resource_id;
  return null;
}

/** Exclusive upper bound (UTC midnight the day after `dateStr`) for a "to" date-range filter. */
export function nextDayIso(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

function stringifyValue(value: unknown): string {
  if (Array.isArray(value)) return value.length > 3 ? `[${value.length} items]` : value.map(String).join(", ");
  if (typeof value === "object" && value !== null) return "{…}";
  const str = String(value);
  return str.length > 40 ? `${str.slice(0, 39)}…` : str;
}
