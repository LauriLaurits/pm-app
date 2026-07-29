import type { DisplayCredentialRow } from "../projects/[id]/credentials/types";

// Render-safe projection of DisplayCredentialRow for THIS page only. CredentialsIndexList is a
// "use client" component (it owns the search box's local state), so whatever shape crosses that
// boundary gets serialized into the flight payload -- readable in the browser's raw network
// response by ANY caller who can load the page, including someone with zero reveal_credential
// grants. secret_id (the Vault secret reference -- see the "never read for display" comment on
// DisplayCredentialRow) must never cross that boundary, and neither should owner_id/notes/
// created_at/updated_at, since nothing here renders them. Add a field ONLY when a component in
// this page actually renders it -- this is an explicit allowlist, not a convenience alias.
export type SafeCredentialRow = Pick<
  DisplayCredentialRow,
  | "id"
  | "project_id"
  | "name"
  | "type"
  | "environment"
  | "visibility"
  | "username"
  | "expires_at"
  | "owner_name"
> & { project_name: string };

export type ProjectCredentialGroup = {
  projectId: string;
  projectName: string;
  /** Whether the current caller holds reveal_credential on THIS project -- computed once per
   * project, not per credential, since it's a project-scoped permission. */
  canReveal: boolean;
  credentials: SafeCredentialRow[];
};
