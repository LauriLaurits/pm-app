import { describe, it, expect } from "vitest";
import {
  addMemberSchema, createProjectSchema, credentialSchema, credentialUpdateSchema, editProjectSchema,
  linkSchema, partSchema, statusUpdateSchema, updateMemberSchema,
} from "@/lib/validation/project";

const validProject = {
  name: "Retail e-shop replatform",
  client_id: "20000001-0000-4000-8000-000000000001",
  description: "Migrate legacy shop to Next.js.",
  status: "active",
  health: "healthy",
  priority: "high",
  budget_type: "hourly",
  start_date: "2026-01-01",
  deadline: "2026-06-01",
  progress: 55,
  risks: "Vendor delay",
  blockers: null,
  next_steps: "Ship checkout",
  internal_notes: "Watch the API rate limits.",
  client_notes: "On track.",
  tags: ["ecommerce", "nextjs"],
  pm_id: "10000005-0000-4000-8000-000000000005",
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

  it("rejects a missing/unknown budget_type", () => {
    const { budget_type, ...rest } = validProject;
    void budget_type;
    expect(editProjectSchema.safeParse(rest).success).toBe(false);
    expect(
      editProjectSchema.safeParse({ ...validProject, budget_type: "retainer" }).success
    ).toBe(false);
  });

  it("rejects a malformed client_id/pm_id and normalizes a blank one to null", () => {
    expect(
      editProjectSchema.safeParse({ ...validProject, client_id: "not-a-uuid" }).success
    ).toBe(false);
    expect(
      editProjectSchema.safeParse({ ...validProject, pm_id: "not-a-uuid" }).success
    ).toBe(false);
    const parsed = editProjectSchema.parse({ ...validProject, client_id: "", pm_id: null });
    expect(parsed.client_id).toBeNull();
    expect(parsed.pm_id).toBeNull();
  });
});

describe("createProjectSchema", () => {
  it("accepts just a name + budget_type -- everything else defaults", () => {
    const parsed = createProjectSchema.parse({ name: "New project", budget_type: "fixed" });
    expect(parsed).toMatchObject({
      name: "New project",
      budget_type: "fixed",
      status: "planning",
      health: "healthy",
      priority: "medium",
      client_id: null,
      description: null,
      start_date: null,
      deadline: null,
      tags: [],
    });
  });

  it("rejects an empty/whitespace-only name", () => {
    expect(createProjectSchema.safeParse({ name: "", budget_type: "fixed" }).success).toBe(false);
    expect(createProjectSchema.safeParse({ name: "   ", budget_type: "fixed" }).success).toBe(false);
  });

  it("rejects a missing/unknown budget_type", () => {
    expect(createProjectSchema.safeParse({ name: "New project" }).success).toBe(false);
    expect(
      createProjectSchema.safeParse({ name: "New project", budget_type: "retainer" }).success
    ).toBe(false);
  });

  it("accepts a fully populated project", () => {
    const parsed = createProjectSchema.safeParse({
      name: "Retail e-shop replatform",
      client_id: "20000001-0000-4000-8000-000000000001",
      description: "Migrate legacy shop to Next.js.",
      status: "active",
      health: "warning",
      priority: "high",
      budget_type: "mixed",
      start_date: "2026-01-01",
      deadline: "2026-06-01",
      tags: ["ecommerce", "nextjs"],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown status/health/priority", () => {
    expect(
      createProjectSchema.safeParse({ name: "X", budget_type: "fixed", status: "cancelled" }).success
    ).toBe(false);
    expect(
      createProjectSchema.safeParse({ name: "X", budget_type: "fixed", health: "bad" }).success
    ).toBe(false);
    expect(
      createProjectSchema.safeParse({ name: "X", budget_type: "fixed", priority: "urgent" }).success
    ).toBe(false);
  });

  it("rejects a malformed client_id and normalizes a blank one to null", () => {
    expect(
      createProjectSchema.safeParse({ name: "X", budget_type: "fixed", client_id: "not-a-uuid" }).success
    ).toBe(false);
    const parsed = createProjectSchema.parse({ name: "X", budget_type: "fixed", client_id: "" });
    expect(parsed.client_id).toBeNull();
  });

  it("rejects a malformed date", () => {
    expect(
      createProjectSchema.safeParse({ name: "X", budget_type: "fixed", deadline: "06/01/2026" }).success
    ).toBe(false);
  });

  it("normalizes blank optional text to null", () => {
    const parsed = createProjectSchema.parse({ name: "X", budget_type: "fixed", description: "   " });
    expect(parsed.description).toBeNull();
  });

  it("rejects blank tags", () => {
    expect(
      createProjectSchema.safeParse({ name: "X", budget_type: "fixed", tags: ["ok", ""] }).success
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

describe("updateMemberSchema", () => {
  it("accepts role/date changes without a user_id", () => {
    const { user_id, ...rest } = validMember;
    void user_id;
    expect(updateMemberSchema.safeParse(rest).success).toBe(true);
  });

  it("ignores a user_id if one is passed (not part of the schema)", () => {
    const parsed = updateMemberSchema.safeParse(validMember);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("user_id");
    }
  });

  it("rejects a malformed date", () => {
    const { user_id, ...rest } = validMember;
    void user_id;
    expect(updateMemberSchema.safeParse({ ...rest, ends_on: "06/01/2026" }).success).toBe(false);
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

const validCredential = {
  name: "Shop staging DB",
  type: "db_login",
  username: "shop_app",
  secret: "St4g1ng-Pw!",
  related_url: "https://staging.shop.balticretail.ee",
  environment: "staging",
  visibility: "project_members",
  notes: "Rotate quarterly",
  expires_at: "2026-12-01",
};

describe("credentialSchema", () => {
  it("accepts a fully populated valid credential", () => {
    expect(credentialSchema.safeParse(validCredential).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(credentialSchema.safeParse({ ...validCredential, name: "  " }).success).toBe(false);
  });

  it("rejects an empty secret", () => {
    expect(credentialSchema.safeParse({ ...validCredential, secret: "" }).success).toBe(false);
  });

  it("rejects an unknown type/environment/visibility", () => {
    expect(credentialSchema.safeParse({ ...validCredential, type: "wifi" }).success).toBe(false);
    expect(credentialSchema.safeParse({ ...validCredential, environment: "qa" }).success).toBe(false);
    expect(credentialSchema.safeParse({ ...validCredential, visibility: "pm_only" }).success).toBe(false);
  });

  it("rejects a malformed related_url", () => {
    expect(credentialSchema.safeParse({ ...validCredential, related_url: "not-a-url" }).success).toBe(false);
  });

  it("allows omitted username/related_url/notes/expires_at and normalizes blank to null", () => {
    const parsed = credentialSchema.parse({
      ...validCredential,
      username: "",
      related_url: undefined,
      notes: "",
      expires_at: null,
    });
    expect(parsed.username).toBeNull();
    expect(parsed.related_url).toBeNull();
    expect(parsed.notes).toBeNull();
    expect(parsed.expires_at).toBeNull();
  });

  it("rejects a malformed expires_at date", () => {
    expect(credentialSchema.safeParse({ ...validCredential, expires_at: "12/01/2026" }).success).toBe(false);
  });
});

describe("credentialUpdateSchema", () => {
  it("accepts non-secret metadata without a secret or type", () => {
    const { secret, type, ...rest } = validCredential;
    void secret;
    void type;
    expect(credentialUpdateSchema.safeParse(rest).success).toBe(true);
  });

  it("strips secret/type if passed (not part of the schema)", () => {
    const parsed = credentialUpdateSchema.safeParse(validCredential);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("secret");
      expect(parsed.data).not.toHaveProperty("type");
    }
  });

  it("rejects an empty name", () => {
    const { secret, type, ...rest } = validCredential;
    void secret;
    void type;
    expect(credentialUpdateSchema.safeParse({ ...rest, name: "  " }).success).toBe(false);
  });
});
