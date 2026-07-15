import { describe, it, expect } from "vitest";
import { editProjectSchema, statusUpdateSchema } from "@/lib/validation/project";

const validProject = {
  name: "Retail e-shop replatform",
  description: "Migrate legacy shop to Next.js.",
  status: "active",
  health: "healthy",
  priority: "high",
  start_date: "2026-01-01",
  deadline: "2026-06-01",
  progress: 55,
  risks: "Vendor delay",
  blockers: null,
  next_steps: "Ship checkout",
  internal_notes: "Watch the API rate limits.",
  client_notes: "On track.",
  tags: ["ecommerce", "nextjs"],
};

describe("editProjectSchema", () => {
  it("accepts a fully populated valid project", () => {
    const parsed = editProjectSchema.safeParse(validProject);
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(
      editProjectSchema.safeParse({ ...validProject, name: "" }).success
    ).toBe(false);
    expect(
      editProjectSchema.safeParse({ ...validProject, name: "   " }).success
    ).toBe(false);
  });

  it("rejects an unknown status/health/priority", () => {
    expect(
      editProjectSchema.safeParse({ ...validProject, status: "cancelled" }).success
    ).toBe(false);
    expect(
      editProjectSchema.safeParse({ ...validProject, health: "bad" }).success
    ).toBe(false);
    expect(
      editProjectSchema.safeParse({ ...validProject, priority: "urgent" }).success
    ).toBe(false);
  });

  it("rejects progress outside 0-100", () => {
    expect(
      editProjectSchema.safeParse({ ...validProject, progress: -1 }).success
    ).toBe(false);
    expect(
      editProjectSchema.safeParse({ ...validProject, progress: 101 }).success
    ).toBe(false);
    expect(
      editProjectSchema.safeParse({ ...validProject, progress: 1.5 }).success
    ).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(
      editProjectSchema.safeParse({ ...validProject, deadline: "06/01/2026" }).success
    ).toBe(false);
  });

  it("normalizes blank optional text and null dates to null", () => {
    const parsed = editProjectSchema.parse({
      ...validProject,
      description: "   ",
      risks: "",
      start_date: null,
      deadline: undefined,
    });
    expect(parsed.description).toBeNull();
    expect(parsed.risks).toBeNull();
    expect(parsed.start_date).toBeNull();
    expect(parsed.deadline).toBeNull();
  });

  it("defaults tags to an empty array when omitted", () => {
    const { tags, ...rest } = validProject;
    void tags;
    const parsed = editProjectSchema.parse(rest);
    expect(parsed.tags).toEqual([]);
  });

  it("rejects blank tags", () => {
    expect(
      editProjectSchema.safeParse({ ...validProject, tags: ["ok", ""] }).success
    ).toBe(false);
  });
});

describe("statusUpdateSchema", () => {
  it("accepts a fully populated status update", () => {
    const parsed = statusUpdateSchema.safeParse({
      completed: "Shipped checkout",
      in_progress: "Payments",
      blockers: null,
      decisions_needed: null,
      next_milestone: "Go-live",
      handover_info: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an update with only one field filled in", () => {
    const parsed = statusUpdateSchema.safeParse({
      completed: null,
      in_progress: "Payments",
      blockers: null,
      decisions_needed: null,
      next_milestone: null,
      handover_info: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a completely blank update", () => {
    const parsed = statusUpdateSchema.safeParse({
      completed: "",
      in_progress: null,
      blockers: "   ",
      decisions_needed: undefined,
      next_milestone: null,
      handover_info: null,
    });
    expect(parsed.success).toBe(false);
  });

  it("normalizes blank strings to null", () => {
    const parsed = statusUpdateSchema.parse({
      completed: "Done",
      in_progress: "",
      blockers: undefined,
      decisions_needed: null,
      next_milestone: null,
      handover_info: null,
    });
    expect(parsed.in_progress).toBeNull();
    expect(parsed.blockers).toBeNull();
  });
});
