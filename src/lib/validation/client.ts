import { z } from "zod";

/** Blank/whitespace-only optional text collapses to null so the DB never stores "". */
function nullableText(max = 4000) {
  return z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : null));
}

const nullableEmail = z
  .string()
  .max(320)
  .optional()
  .nullable()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : null))
  .refine((v) => !v || z.string().email().safeParse(v).success, "Enter a valid email");

/** One repeatable contact row in the client form -> one client_contacts row. */
export const clientContactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: nullableEmail,
  phone: nullableText(50),
  role: nullableText(200),
  is_primary: z.boolean(),
});

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  notes: nullableText(),
  // Multiple contact persons (P2 feedback). The legacy clients.contact_name/contact_email/phone
  // columns are no longer form fields -- upsertClientAction keeps them synced from whichever
  // row is primary, for the views/pages that still read them.
  contacts: z.array(clientContactSchema).max(50),
});
// `.input` (pre-transform shape) is what the form holds and the action receives from the
// client; `.output` (post-transform, e.g. "" -> null) is what safeParse hands back for the DB.
export type ClientInput = z.input<typeof clientSchema>;
export type ClientOutput = z.output<typeof clientSchema>;
export type ClientContactInput = z.input<typeof clientContactSchema>;
