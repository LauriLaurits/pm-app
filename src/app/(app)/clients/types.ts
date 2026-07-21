import type { Database } from "@/lib/database.types";

export type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
export type ClientContactRow = Database["public"]["Tables"]["client_contacts"]["Row"];

/** project_count/project_names are computed in page.tsx from an RLS'd read of `projects` (never
 * a raw count() over all projects) -- for a caller who can't see every project these may
 * undercount, same caveat as every other RLS-scoped rollup in this app (see project_list_rows).
 * contacts arrive primary-first (page.tsx orders the client_contacts read). */
export type ClientListRow = ClientRow & {
  project_count: number;
  project_names: string[];
  contacts: ClientContactRow[];
};
