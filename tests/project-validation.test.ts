import { describe, it, expect } from "vitest";
import {
  addMemberSchema, editProjectSchema, linkSchema, partSchema, statusUpdateSchema,
} from "@/lib/validation/project";

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

const validPart = {
  name: "Backend",
  description: "API + integrations",
  status: "in_progress",
  responsible_person_id: "50000003-0000-4000-8000-000000000003",
  billing_model: "hourly",
  estimated_hours: 400,
  progress: 60,
  start_date: "2026-01-01",
  end_date: "2026-06-01",
  notes: "On track",
  client_price: 20000,
  fixed_amount: null,
  hourly_rate: 50,
};

describe("partSchema", () => {
  it("accepts a fully populated valid part", () => {
    expect(partSchema.safeParse(validPart).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(partSchema.safeParse({ ...validPart, name: "  " }).success).toBe(false);
  });

  it("rejects an unknown status/billing_model", () => {
    expect(partSchema.safeParse({ ...validPart, status: "cancelled" }).success).toBe(false);
    expect(partSchema.safeParse({ ...validPart, billing_model: "retainer" }).success).toBe(false);
  });

  it("rejects progress outside 0-100", () => {
    expect(partSchema.safeParse({ ...validPart, progress: -1 }).success).toBe(false);
    expect(partSchema.safeParse({ ...validPart, progress: 101 }).success).toBe(false);
  });

  it("rejects a negative billing figure", () => {
    expect(partSchema.safeParse({ ...validPart, client_price: -1 }).success).toBe(false);
    expect(partSchema.safeParse({ ...validPart, hourly_rate: -1 }).success).toBe(false);
  });

  it("rejects a malformed responsible_person_id", () => {
    expect(
      partSchema.safeParse({ ...validPart, responsible_person_id: "not-a-uuid" }).success
    ).toBe(false);
  });

  it("allows a null/blank responsible_person_id and normalizes blank to null", () => {
    const parsed = partSchema.parse({ ...validPart, responsible_person_id: "" });
    expect(parsed.responsible_person_id).toBeNull();
    expect(partSchema.safeParse({ ...validPart, responsible_person_id: null }).success).toBe(true);
  });

  it("allows omitted billing figures (non-view_budget caller never submits them)", () => {
    const { client_price, fixed_amount, hourly_rate, ...rest } = validPart;
    void client_price;
    void fixed_amount;
    void hourly_rate;
    const parsed = partSchema.safeParse(rest);
    expect(parsed.success).toBe(true);
  });

  it("normalizes blank optional text to null", () => {
    const parsed = partSchema.parse({ ...validPart, description: "  ", notes: "" });
    expect(parsed.description).toBeNull();
    expect(parsed.notes).toBeNull();
  });
});

const validMember = {
  user_id: "10000005-0000-4000-8000-000000000005",
  role_on_project: "backend lead",
  starts_on: "2026-01-01",
  ends_on: null,
};

describe("addMemberSchema", () => {
  it("accepts a fully populated valid member", () => {
    expect(addMemberSchema.safeParse(validMember).success).toBe(true);
  });

  it("rejects a non-uuid user_id", () => {
    expect(addMemberSchema.safeParse({ ...validMember, user_id: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects a missing user_id", () => {
    const { user_id, ...rest } = validMember;
    void user_id;
    expect(addMemberSchema.safeParse(rest).success).toBe(false);
  });

  it("allows an omitted role_on_project and normalizes blank to null", () => {
    const parsed = addMemberSchema.parse({ ...validMember, role_on_project: "" });
    expect(parsed.role_on_project).toBeNull();
  });

  it("rejects a malformed date", () => {
    expect(addMemberSchema.safeParse({ ...validMember, starts_on: "01/01/2026" }).success).toBe(false);
  });
});

const validLink = {
  name: "Prod monitoring",
  url: "https://grafana.acme.dev/shop",
  type: "monitoring",
  environment: "prod",
  description: "Grafana dashboards",
  visibility: "pm_only",
};

describe("linkSchema", () => {
  it("accepts a fully populated valid link", () => {
    expect(linkSchema.safeParse(validLink).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(linkSchema.safeParse({ ...validLink, name: "  " }).success).toBe(false);
  });

  it("rejects a malformed url", () => {
    expect(linkSchema.safeParse({ ...validLink, url: "not-a-url" }).success).toBe(false);
  });

  it("rejects an unknown type/visibility", () => {
    expect(linkSchema.safeParse({ ...validLink, type: "wiki" }).success).toBe(false);
    expect(linkSchema.safeParse({ ...validLink, visibility: "public" }).success).toBe(false);
  });

  it("allows omitted environment/description and normalizes blank to null", () => {
    const parsed = linkSchema.parse({ ...validLink, environment: "", description: undefined });
    expect(parsed.environment).toBeNull();
    expect(parsed.description).toBeNull();
  });
});
