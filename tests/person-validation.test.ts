import { describe, it, expect } from "vitest";
import { personSchema } from "@/lib/validation/person";

const validPerson = {
  full_name: "Ada Lovelace",
  email: "ada@example.com",
  role_title: "Engineer",
  department: "Engineering",
  employment_type: "employee",
  weekly_capacity_hours: 40,
  status: "active",
};

describe("personSchema", () => {
  it("accepts a fully populated valid person", () => {
    expect(personSchema.safeParse(validPerson).success).toBe(true);
  });

  it("rejects an empty full_name", () => {
    expect(personSchema.safeParse({ ...validPerson, full_name: "  " }).success).toBe(false);
  });

  it("rejects a missing full_name", () => {
    const { full_name, ...rest } = validPerson;
    void full_name;
    expect(personSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(personSchema.safeParse({ ...validPerson, email: "not-an-email" }).success).toBe(false);
  });

  it("allows an omitted email and normalizes blank to null", () => {
    const parsed = personSchema.parse({ ...validPerson, email: "" });
    expect(parsed.email).toBeNull();
    expect(personSchema.safeParse({ ...validPerson, email: null }).success).toBe(true);
  });

  it("normalizes blank optional text (role_title/department) to null", () => {
    const parsed = personSchema.parse({ ...validPerson, role_title: "  ", department: "" });
    expect(parsed.role_title).toBeNull();
    expect(parsed.department).toBeNull();
  });

  it("rejects an unknown employment_type/status", () => {
    expect(personSchema.safeParse({ ...validPerson, employment_type: "intern" }).success).toBe(false);
    expect(personSchema.safeParse({ ...validPerson, status: "archived" }).success).toBe(false);
  });

  it("rejects weekly_capacity_hours <= 0", () => {
    expect(personSchema.safeParse({ ...validPerson, weekly_capacity_hours: 0 }).success).toBe(false);
    expect(personSchema.safeParse({ ...validPerson, weekly_capacity_hours: -5 }).success).toBe(false);
  });

  it("rejects weekly_capacity_hours > 168", () => {
    expect(personSchema.safeParse({ ...validPerson, weekly_capacity_hours: 169 }).success).toBe(false);
  });

  it("accepts weekly_capacity_hours at the 168 boundary", () => {
    expect(personSchema.safeParse({ ...validPerson, weekly_capacity_hours: 168 }).success).toBe(true);
  });
});
