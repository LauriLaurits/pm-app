/** Escapes Postgres `ilike` wildcard/escape characters in free-text search input before it's
 * interpolated into a `%${q}%` pattern -- backslash first (so escaping it doesn't double-escape
 * the `%`/`_` backslashes added after), then the two wildcard characters. Pure so it's directly
 * testable without spinning up a Supabase client. */
export function escapeIlike(q: string): string {
  return q.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
