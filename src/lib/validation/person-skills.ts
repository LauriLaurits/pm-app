import { z } from "zod";

export const SKILL_LEVEL_OPTIONS = [1, 2, 3, 4, 5] as const;

/** Blank/whitespace-only optional text collapses to null so the DB never stores "". */
function nullableText(max = 200) {
  return z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null));
}

const nullableUuid = z
  .string()
  .optional()
  .nullable()
  .refine((v) => !v || z.uuid().safeParse(v).success, "Invalid skill")
  .transform((v) => (v && v.trim() !== "" ? v : null));

// Exactly one of `skill_id` (pick an existing skill) / `new_skill_name` (create one on the fly)
// must be present — enforced by the refine below rather than a discriminated union, so the form
// can flip between the two modes without swapping the whole shape. `new_skill_category` is only
// ever read when `new_skill_name` is set (see addPersonSkillAction).
export const personSkillSchema = z
  .object({
    skill_id: nullableUuid,
    new_skill_name: nullableText(200),
    new_skill_category: nullableText(200),
    // person_skills.level: int check (level between 1 and 5) — mirrored here.
    level: z
      .number({ message: "Pick a level" })
      .int()
      .min(1, "Level must be between 1 and 5")
      .max(5, "Level must be between 1 and 5"),
  })
  .refine((data) => !!data.skill_id || !!data.new_skill_name, {
    message: "Pick an existing skill or enter a new skill name",
    path: ["skill_id"],
  });

export type PersonSkillInput = z.input<typeof personSkillSchema>;
export type PersonSkillOutput = z.output<typeof personSkillSchema>;
