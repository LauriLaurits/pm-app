import { KeyRoundIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate, humanize } from "../../types";
import { CredentialDeleteButton } from "./credential-actions";
import { CredentialFormDialog } from "./credential-form-dialog";
import type { DisplayCredentialRow } from "./types";

const VISIBILITY_BADGE: Record<DisplayCredentialRow["visibility"], "outline" | "secondary" | "destructive"> = {
  project_members: "outline",
  pms_only: "secondary",
  admins_only: "destructive",
};

// Never render the real secret here (or anywhere in this tab) -- reveal/decrypt is a later,
// higher-security phase. This mask is the only thing that ever stands in for a credential's
// value; secret_id (the vault.secrets FK) is likewise never read out of DisplayCredentialRow.
const MASK = "••••••••••••";

/** Grouped by environment -- RLS already narrowed `credentials` to what this caller may see
 * (project_members/pms_only/admins_only tiers, plus any explicit credential_access grant), so
 * grouping here is display-only, never a filter. */
function groupByEnvironment(credentials: DisplayCredentialRow[]) {
  const groups = new Map<DisplayCredentialRow["environment"], DisplayCredentialRow[]>();
  for (const c of credentials) groups.set(c.environment, [...(groups.get(c.environment) ?? []), c]);
  return [...groups.entries()];
}

export function CredentialsList({
  credentials,
  projectId,
  canManage,
}: {
  credentials: DisplayCredentialRow[];
  projectId: string;
  canManage: boolean;
}) {
  if (credentials.length === 0) {
    return <p className="text-muted-foreground">No credentials for this project yet.</p>;
  }

  return (
    <div className="space-y-6">
      {groupByEnvironment(credentials).map(([environment, group]) => (
        <div key={environment} className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">{humanize(environment)}</h3>
          <div className="space-y-2">
            {group.map((credential) => (
              <div key={credential.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{credential.name}</span>
                    <Badge variant="outline">{humanize(credential.type)}</Badge>
                    <Badge variant={VISIBILITY_BADGE[credential.visibility]}>
                      {humanize(credential.visibility)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {credential.username && <span>User: {credential.username}</span>}
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span className="flex items-center gap-1 font-mono tabular-nums">
                            <KeyRoundIcon className="size-3" />
                            {MASK}
                          </span>
                        }
                      />
                      <TooltipContent>Revealing secrets is coming in a later update.</TooltipContent>
                    </Tooltip>
                    {credential.expires_at && <span>Expires: {formatDate(credential.expires_at)}</span>}
                    {credential.owner_name && <span>Owner: {credential.owner_name}</span>}
                  </div>
                  {credential.notes && <p className="text-xs text-muted-foreground">{credential.notes}</p>}
                </div>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-2">
                    <CredentialFormDialog projectId={projectId} credential={credential} />
                    <CredentialDeleteButton projectId={projectId} credential={credential} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
