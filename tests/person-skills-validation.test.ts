import { describe, it, expect } from "vitest";
import { personSkillSchema } from "@/lib/validation/person-skills";

const existingSkill = {
  skill_id: "60000001-0000-4000-8000-000000000001",
  new_skill_name: null,
  new_skill_category: null,
  level: 3,
};

const newSkill = {
  skill_id: null,
  new_skill_name: "Rust",
  new_skill_category: "Engineering",
  level: 4,
};

describe("personSkillSchema", () => {
  it("accepts picking an existing skill by id", () => {
    expect(personSkillSchema.safeParse(existingSkill).success).toBe(true);
  });

  it("accepts creating a new skill by name (skill_id omitted)", () => {
    expect(personSkillSchema.safeParse(newSkill).success).toBe(true);
  });

  it("collapses a blank new_skill_category to null", () => {
    const parsed = personSkillSchema.safeParse({ ...newSkill, new_skill_category: "   " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.new_skill_category).toBeNull();
  });

  it("rejects when neither skill_id nor new_skill_name is provided", () => {
    expect(
      personSkillSchema.safeParse({
        skill_id: null,
        new_skill_name: null,
        new_skill_category: null,
        level: 3,
      }).success
    ).toBe(false);
  });

  it("rejects a non-uuid skill_id", () => {
    expect(
      personSkillSchema.safeParse({ ...existingSkill, skill_id: "not-a-uuid" }).success
    ).toBe(false);
  });

  it("rejects a level of 0", () => {
    expect(personSkillSchema.safeParse({ ...existingSkill, level: 0 }).success).toBe(false);
  });

  it("rejects a level above 5", () => {
    expect(personSkillSchema.safeParse({ ...existingSkill, level: 6 }).success).toBe(false);
  });

  it("accepts levels at the 1 and 5 boundaries", () => {
    expect(personSkillSchema.safeParse({ ...existingSkill, level: 1 }).success).toBe(true);
    expect(personSkillSchema.safeParse({ ...existingSkill, level: 5 }).success).toBe(true);
  });

  it("rejects a non-integer level", () => {
    expect(personSkillSchema.safeParse({ ...existingSkill, level: 3.5 }).success).toBe(false);
  });
});
