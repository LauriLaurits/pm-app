import type { Database } from "@/lib/database.types";

export type ClientRow = Database["public"]["Tables"]["clients"]["Row"];

/** project_count is computed in page.tsx from an RLS'd read of `projects` (never a raw count()
 * over all projects) -- for a caller who can't see every project this may undercount, same
 * caveat as every other RLS-scoped rollup in this app (see project_list_rows). */
export type ClientListRow = ClientRow & { project_count: number };
