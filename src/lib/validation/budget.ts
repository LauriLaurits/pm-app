import { z } from "zod";

/** Optional/nullable money figure — same shape as partSchema's nullableAmount
 * (src/lib/validation/project.ts), duplicated here rather than imported so this module has no
 * dependency on the parts form; both must stay in sync if the bound ever changes. */
const nullableAmount = z.number().min(0).max(10_000_000).optional().nullable();

/** Client-facing billing figures for a part -- written to `part_billing`, gated by
 * `manage_budget` (RLS "manage part billing" in 20260715000005_budgets.sql). Every field is
 * optional: a caller can set just one figure (e.g. only hourly_rate for an hourly part). */
export const partBillingSchema = z.object({
  client_price: nullableAmount,
  fixed_amount: nullableAmount,
  hourly_rate: nullableAmount,
});
export type PartBillingInput = z.input<typeof partBillingSchema>;
export type PartBillingOutput = z.output<typeof partBillingSchema>;

/** Internal cost figures for a part -- written to `part_costs`, gated by BOTH
 * `view_internal_cost` and `manage_budget` (RLS "finance manages part costs"). In practice only
 * finance holds both, so this schema/action pair is finance-only end to end. */
export const partCostsSchema = z.object({
  planned_internal_cost: nullableAmount,
  actual_internal_cost: nullableAmount,
});
export type PartCostsInput = z.input<typeof partCostsSchema>;
export type PartCostsOutput = z.output<typeof partCostsSchema>;

// Mirrors the DB enum `budget_item_type` (20260715000005_budgets.sql) exactly.
export const BUDGET_ITEM_TYPE_OPTIONS = [
  "invoice",
  "payment",
  "change",
  "planned_cost",
  "actual_cost",
] as const;
// The subset any `manage_budget` holder (PM on own projects, finance everywhere) can record --
// no internal-cost knowledge required. Used to build the type <Select> for a caller without
// `view_internal_cost` so a PM is never even offered a cost-type option.
export const CLIENT_BUDGET_ITEM_TYPES = ["invoice", "payment", "change"] as const;
// Cost-type rows hold internal money -- only ever offered to a `view_internal_cost` holder
// (finance). See addBudgetItemAction (src/app/actions/budget-items.ts), which re-enforces this
// server-side regardless of what the client submits.
export const COST_BUDGET_ITEM_TYPES = ["planned_cost", "actual_cost"] as const;

const nullableText = (max = 2000) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null));

const requiredDate = z
  .string()
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a valid date");

/** A single budget_items row (invoice/payment/change/planned_cost/actual_cost). `amount` is
 * signed on purpose -- a "change" can be a scope reduction (negative), matching formatMoney's
 * existing negative-amount rendering (src/lib/budget.ts). */
export const budgetItemSchema = z.object({
  item_type: z.enum(BUDGET_ITEM_TYPE_OPTIONS),
  name: z.string().trim().min(1, "Name is required").max(200),
  amount: z.number().min(-10_000_000).max(10_000_000),
  occurred_on: requiredDate,
  note: nullableText(),
});
export type BudgetItemInput = z.input<typeof budgetItemSchema>;
export type BudgetItemOutput = z.output<typeof budgetItemSchema>;
