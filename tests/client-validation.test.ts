import { describe, it, expect } from "vitest";
import { clientContactSchema, clientSchema } from "@/lib/validation/client";

const validContact = {
  name: "Kadri Mets",
  email: "kadri@balticretail.ee",
  phone: "+372 555 1234",
  role: "CEO",
  is_primary: true,
};

const validClient = {
  name: "Baltic Retail Group",
  notes: "Prefers Friday demos.",
  contacts: [validContact, { ...validContact, name: "Marko Saar", is_primary: false }],
};

describe("clientSchema", () => {
  it("accepts a fully populated valid client", () => {
    expect(clientSchema.safeParse(validClient).success).toBe(true);
  });

  it("accepts a client with only a name and no contacts", () => {
    expect(clientSchema.safeParse({ name: "Acme Inc", contacts: [] }).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(clientSchema.safeParse({ ...validClient, name: "  " }).success).toBe(false);
  });

  it("rejects a missing name", () => {
    const { name, ...rest } = validClient;
    void name;
    expect(clientSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a missing contacts array", () => {
    expect(clientSchema.safeParse({ name: "Acme Inc" }).success).toBe(false);
  });

  it("normalizes blank notes to null", () => {
    const parsed = clientSchema.parse({ ...validClient, notes: "   " });
    expect(parsed.notes).toBeNull();
  });

  it("trims a name with surrounding whitespace", () => {
    const parsed = clientSchema.parse({ ...validClient, name: "  Acme Inc  " });
    expect(parsed.name).toBe("Acme Inc");
  });

  it("rejects a name over 200 characters", () => {
    expect(clientSchema.safeParse({ ...validClient, name: "a".repeat(201) }).success).toBe(false);
  });

  it("rejects a contact with a malformed email", () => {
    expect(
      clientSchema.safeParse({
        ...validClient,
        contacts: [{ ...validContact, email: "not-an-email" }],
      }).success
    ).toBe(false);
  });

  it("rejects a contact without a name", () => {
    expect(
      clientSchema.safeParse({ ...validClient, contacts: [{ ...validContact, name: "  " }] })
        .success
    ).toBe(false);
  });
});

describe("clientContactSchema", () => {
  it("accepts a contact with only a name", () => {
    expect(clientContactSchema.safeParse({ name: "Solo Contact", is_primary: false }).success).toBe(
      true
    );
  });

  it("normalizes blank optional text (email/phone/role) to null", () => {
    const parsed = clientContactSchema.parse({
      ...validContact,
      email: "",
      phone: "  ",
      role: "",
    });
    expect(parsed.email).toBeNull();
    expect(parsed.phone).toBeNull();
    expect(parsed.role).toBeNull();
  });

  it("rejects a missing is_primary flag", () => {
    expect(clientContactSchema.safeParse({ name: "No Flag" }).success).toBe(false);
  });
});
