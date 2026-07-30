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

// Render-safe projection of PartRow for the "use client" components fed by the Parts tab
// (PartsTable, PartFormDialog/PartForm, PartDeleteButton): whatever shape crosses that boundary
// gets serialized into the flight payload, readable in the raw page response by ANY view_project
// holder on this project -- a much broader population than edit_project (the permission that
// actually gates PartFormDialog/PartDeleteButton, see canEdit in parts-table.tsx). `notes` has no
// permission gate of its own (plain column select, project_parts RLS is row-level only) and
// `fixed_amount`/`hourly_rate` are only ever rendered inside PartForm's canViewBudget block --
// both are only meaningful to someone who can also edit the part.
//
// IMPORTANT: a JSON key survives in the serialized flight payload even when its value is `null`
// -- nulling the value alone does NOT stop `"notes"`/`"hourly_rate"` from appearing in the raw
// HTML. So `notes`/`progress`/`start_date`/`end_date` (edit-only, no read-view rendering) and
// `part_billing.fixed_amount`/`hourly_rate` (edit-only rate detail) are typed OPTIONAL here and
// page.tsx must OMIT the keys entirely (not just null the values) for anyone who isn't
// edit_project on this project -- same as `part_billing` itself, which RLS drops entirely
// (join returns no row, not a row of nulls) for a non-view_budget caller.
export type SafePartRow = Pick<
  PartRow,
  "id" | "name" | "description" | "status" | "responsible_person_id" | "billing_model" | "estimated_hours"
> &
  Partial<Pick<PartRow, "progress" | "start_date" | "end_date" | "notes">> & {
    part_billing:
      | (Pick<PartBilling, "client_price"> & Partial<Pick<PartBilling, "fixed_amount" | "hourly_rate">>)
      | null;
  };
