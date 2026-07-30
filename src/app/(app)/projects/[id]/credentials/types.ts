import type { Database } from "@/lib/database.types";

export type CredentialRow = Database["public"]["Tables"]["credentials"]["Row"];

// owner_name resolved via `people`, same precedent as Links' owner_name -- see links/page.tsx.
// secret_id is present on CredentialRow (it's a plain column select) but must never be read for
// display anywhere in this tab: no component here may render it or fetch vault.secrets.
export type DisplayCredentialRow = CredentialRow & { owner_name: string | null };

// Render-safe projection of DisplayCredentialRow for THIS tab's client components
// (CredentialsList, CredentialFormDialog, CredentialDeleteButton, CredentialEditForm -- all
// "use client"). Whatever shape crosses that boundary gets serialized into the flight payload --
// readable in the raw page response by ANY manage_credentials holder on this project, reveal
// rights or not (CredentialRevealControl, the only place a decrypted secret ever lives
// client-side, is gated separately by canReveal and takes credentialId/projectId, never
// secret_id). secret_id (the Vault reference), owner_id, project_id, created_at, updated_at must
// never cross -- add a field ONLY when a component in this tab actually renders/uses it. Mirrors
// the global index's SafeCredentialRow (../../../credentials/types.ts), just with the extra
// fields (related_url, last_rotated_at) this tab's edit form and read view actually use that the
// index deliberately omits.
export type SafeCredentialRow = Pick<
  DisplayCredentialRow,
  | "id"
  | "name"
  | "type"
  | "environment"
  | "visibility"
  | "username"
  | "related_url"
  | "expires_at"
  | "last_rotated_at"
  | "notes"
  | "owner_name"
>;
