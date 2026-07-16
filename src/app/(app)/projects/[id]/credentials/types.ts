import type { Database } from "@/lib/database.types";

export type CredentialRow = Database["public"]["Tables"]["credentials"]["Row"];

// owner_name resolved via `people`, same precedent as Links' owner_name -- see links/page.tsx.
// secret_id is present on CredentialRow (it's a plain column select) but must never be read for
// display anywhere in this tab: no component here may render it or fetch vault.secrets.
export type DisplayCredentialRow = CredentialRow & { owner_name: string | null };
