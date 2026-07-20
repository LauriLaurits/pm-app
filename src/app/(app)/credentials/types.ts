import type { DisplayCredentialRow } from "../projects/[id]/credentials/types";

export type ProjectCredentialGroup = {
  projectId: string;
  projectName: string;
  /** Whether the current caller holds reveal_credential on THIS project -- computed once per
   * project, not per credential, since it's a project-scoped permission. */
  canReveal: boolean;
  credentials: (DisplayCredentialRow & { project_name: string })[];
};
