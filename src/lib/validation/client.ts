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

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  contact_name: nullableText(200),
  contact_email: nullableEmail,
  phone: nullableText(50),
  notes: nullableText(),
});
// `.input` (pre-transform shape) is what the form holds and the action receives from the
// client; `.output` (post-transform, e.g. "" -> null) is what safeParse hands back for the DB.
export type ClientInput = z.input<typeof clientSchema>;
export type ClientOutput = z.output<typeof clientSchema>;
