import type { Database } from "@/lib/database.types";

export type ProjectMemberRow = Database["public"]["Tables"]["project_members"]["Row"];

/** A project_members row enriched with the member's `people` identity (name/avatar) and
 * their total allocation_pct across `assignments` on this project (summed across parts). */
export type MemberRow = ProjectMemberRow & {
  full_name: string | null;
  avatar_url: string | null;
  allocation_pct: number | null;
};

/** Candidate for the add-member picker -- a `people` row that has a linked user account
 * (project_members.user_id references user_profiles, so people without one can't be added). */
export type PersonOption = { user_id: string; full_name: string };
