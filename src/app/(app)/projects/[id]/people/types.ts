import type { Database } from "@/lib/database.types";

export type ProjectMemberRow = Database["public"]["Tables"]["project_members"]["Row"];

/** A project_members row enriched with the member's `people` identity (name/avatar). One row
 * per membership PERIOD -- since 20260722000001_member_periods.sql a person can hold several
 * (starts_on/ends_on delimited) rows on the same project, so the same person can appear in the
 * Team table more than once. Allocation is deliberately absent: assignments/workload plumbing
 * stays in the DB (the workload views read it) but is no longer shown or written from this tab. */
export type MemberRow = ProjectMemberRow & {
  full_name: string | null;
  avatar_url: string | null;
  /** people.id for the person-detail link (null if the user has no people row). */
  person_id: string | null;
};

/** Row in the "Manage members" checklist -- a `people` row that has a linked user account
 * (project_members.user_id references user_profiles, so people without one can't be added at
 * all) plus whatever project_members.id it currently has, if it's already a member. `memberId`
 * is what drives the checkbox: non-null = checked = on the project; removing calls
 * removeMemberAction(memberId), adding calls addMemberAction(user_id). With member periods a
 * person can have several rows; memberId then carries any one of them (first-add UIs filter to
 * memberId === null, additional periods go through the per-row "Add period" action instead). */
export type CandidateOption = {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  memberId: number | null;
};
