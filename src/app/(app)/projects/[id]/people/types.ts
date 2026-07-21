import type { Database } from "@/lib/database.types";

export type ProjectMemberRow = Database["public"]["Tables"]["project_members"]["Row"];

/** A project_members row enriched with the member's `people` identity (name/avatar) and
 * their total allocation_pct across `assignments` on this project (summed across parts). */
export type MemberRow = ProjectMemberRow & {
  full_name: string | null;
  avatar_url: string | null;
  allocation_pct: number | null;
  /** people.id for the person-detail link (null if the user has no people row). */
  person_id: string | null;
};

/** Row in the "Manage members" checklist -- a `people` row that has a linked user account
 * (project_members.user_id references user_profiles, so people without one can't be added at
 * all) plus whatever project_members.id it currently has, if it's already a member. `memberId`
 * is what drives the checkbox: non-null = checked = on the project; removing calls
 * removeMemberAction(memberId), adding calls addMemberAction(user_id). */
export type CandidateOption = {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  memberId: number | null;
};
