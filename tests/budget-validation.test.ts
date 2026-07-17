import { describe, it, expect } from "vitest";
import {
  partBillingSchema,
  partCostsSchema,
  budgetItemSchema,
  BUDGET_ITEM_TYPE_OPTIONS,
  CLIENT_BUDGET_ITEM_TYPES,
  COST_BUDGET_ITEM_TYPES,
} from "@/lib/validation/budget";

describe("partBillingSchema", () => {
  it("accepts all three figures", () => {
    const result = partBillingSchema.safeParse({
      client_price: 15000,
      fixed_amount: 12000,
      hourly_rate: 85,
    });
    expect(result.success).toBe(true);
  });

  it("accepts every field being null (nothing entered yet)", () => {
    const result = partBillingSchema.safeParse({
      client_price: null,
      fixed_amount: null,
      hourly_rate: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative amount", () => {
    const result = partBillingSchema.safeParse({
      client_price: -100,
      fixed_amount: null,
      hourly_rate: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an amount over the 10,000,000 bound", () => {
    const result = partBillingSchema.safeParse({
      client_price: 10_000_001,
      fixed_amount: null,
      hourly_rate: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("partCostsSchema", () => {
  it("accepts both cost figures", () => {
    const result = partCostsSchema.safeParse({
      planned_internal_cost: 8000,
      actual_internal_cost: 8200,
    });
    expect(result.success).toBe(true);
  });

  it("accepts both being null", () => {
    const result = partCostsSchema.safeParse({
      planned_internal_cost: null,
      actual_internal_cost: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative cost", () => {
    const result = partCostsSchema.safeParse({
      planned_internal_cost: -1,
      actual_internal_cost: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("budgetItemSchema", () => {
  const base = {
    item_type: "invoice" as const,
    name: "Milestone 1 invoice",
    amount: 5000,
    occurred_on: "2026-07-14",
    note: null,
  };

  it("accepts a valid invoice entry", () => {
    expect(budgetItemSchema.safeParse(base).success).toBe(true);
  });

  it("accepts a negative amount for a 'change' entry (scope reduction)", () => {
    const result = budgetItemSchema.safeParse({ ...base, item_type: "change", amount: -2000 });
    expect(result.success).toBe(true);
  });

  it("requires a non-blank name", () => {
    const result = budgetItemSchema.safeParse({ ...base, name: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid item_type", () => {
    const result = budgetItemSchema.safeParse({ ...base, item_type: "bogus" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed date", () => {
    const result = budgetItemSchema.safeParse({ ...base, occurred_on: "07/14/2026" });
    expect(result.success).toBe(false);
  });

  it("collapses a blank note to null", () => {
    const result = budgetItemSchema.safeParse({ ...base, note: "   " });
    expect(result.success && result.data.note).toBe(null);
  });

  it("rejects an amount beyond the bound in either direction", () => {
    expect(budgetItemSchema.safeParse({ ...base, amount: 10_000_001 }).success).toBe(false);
    expect(budgetItemSchema.safeParse({ ...base, amount: -10_000_001 }).success).toBe(false);
  });
});

describe("item-type option sets", () => {
  it("CLIENT_BUDGET_ITEM_TYPES excludes both cost types", () => {
    expect(CLIENT_BUDGET_ITEM_TYPES).not.toContain("planned_cost");
    expect(CLIENT_BUDGET_ITEM_TYPES).not.toContain("actual_cost");
  });

  it("COST_BUDGET_ITEM_TYPES contains only the two cost types", () => {
    expect([...COST_BUDGET_ITEM_TYPES].sort()).toEqual(["actual_cost", "planned_cost"]);
  });

  it("CLIENT_BUDGET_ITEM_TYPES + COST_BUDGET_ITEM_TYPES cover BUDGET_ITEM_TYPE_OPTIONS exactly", () => {
    const combined = [...CLIENT_BUDGET_ITEM_TYPES, ...COST_BUDGET_ITEM_TYPES].sort();
    expect(combined).toEqual([...BUDGET_ITEM_TYPE_OPTIONS].sort());
  });
});
