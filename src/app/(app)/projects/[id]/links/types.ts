import type { Database } from "@/lib/database.types";

export type ProjectLinkRow = Database["public"]["Tables"]["project_links"]["Row"];

// owner_name resolved via `people` the same way pm/owner names are on Overview -- see page.tsx.
export type LinkRow = ProjectLinkRow & { owner_name: string | null };
