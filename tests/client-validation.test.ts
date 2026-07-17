import { describe, it, expect } from "vitest";
import { clientSchema } from "@/lib/validation/client";

const validClient = {
  name: "Baltic Retail Group",
  contact_name: "Kadri Mets",
  contact_email: "kadri@balticretail.ee",
  phone: "+372 555 1234",
  notes: "Prefers Friday demos.",
};

describe("clientSchema", () => {
  it("accepts a fully populated valid client", () => {
    expect(clientSchema.safeParse(validClient).success).toBe(true);
  });

  it("accepts a client with only a name (everything else omitted)", () => {
    expect(clientSchema.safeParse({ name: "Acme Inc" }).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(clientSchema.safeParse({ ...validClient, name: "  " }).success).toBe(false);
  });

  it("rejects a missing name", () => {
    const { name, ...rest } = validClient;
    void name;
    expect(clientSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a malformed contact_email", () => {
    expect(clientSchema.safeParse({ ...validClient, contact_email: "not-an-email" }).success).toBe(false);
  });

  it("allows an omitted contact_email and normalizes blank to null", () => {
    const parsed = clientSchema.parse({ ...validClient, contact_email: "" });
    expect(parsed.contact_email).toBeNull();
    expect(clientSchema.safeParse({ ...validClient, contact_email: null }).success).toBe(true);
  });

  it("normalizes blank optional text (contact_name/phone/notes) to null", () => {
    const parsed = clientSchema.parse({ ...validClient, contact_name: "  ", phone: "", notes: "   " });
    expect(parsed.contact_name).toBeNull();
    expect(parsed.phone).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  it("trims a name with surrounding whitespace", () => {
    const parsed = clientSchema.parse({ ...validClient, name: "  Acme Inc  " });
    expect(parsed.name).toBe("Acme Inc");
  });

  it("rejects a name over 200 characters", () => {
    expect(clientSchema.safeParse({ ...validClient, name: "a".repeat(201) }).success).toBe(false);
  });
});
