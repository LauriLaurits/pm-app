import type { Database } from "@/lib/database.types";

export type PartBilling = Pick<
  Database["public"]["Tables"]["part_billing"]["Row"],
  "client_price" | "fixed_amount" | "hourly_rate" | "currency"
>;

// `part_billing` is left-joined in the parts query below; RLS (view_budget) nulls it
// out entirely for a caller who lacks that permission rather than erroring.
export type PartRow = Database["public"]["Tables"]["project_parts"]["Row"] & {
  part_billing: PartBilling | null;
};

export type PersonOption = { id: string; full_name: string };
