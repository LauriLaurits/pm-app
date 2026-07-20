import { KeyRoundIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate, humanize } from "../../types";
import { MASK, VISIBILITY_BADGE, expiryStatus, groupByEnvironment } from "@/lib/credentials-display";
import { CredentialDeleteButton } from "./credential-actions";
import { CredentialFormDialog } from "./credential-form-dialog";
import { CredentialRevealControl } from "./credential-reveal-control";
import type { DisplayCredentialRow } from "./types";

export function CredentialsList({
  credentials,
  projectId,
  canManage,
  canReveal,
}: {
  credentials: DisplayCredentialRow[];
  projectId: string;
  canManage: boolean;
  canReveal: boolean;
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
                    {canReveal ? (
                      <CredentialRevealControl projectId={projectId} credentialId={credential.id} />
                    ) : (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span className="flex items-center gap-1 font-mono tabular-nums">
                              <KeyRoundIcon className="size-3" />
                              {MASK}
                            </span>
                          }
                        />
                        <TooltipContent>You don&apos;t have permission to reveal secrets on this project.</TooltipContent>
                      </Tooltip>
                    )}
                    {credential.expires_at && (
                      <span className="flex items-center gap-1">
                        Expires: {formatDate(credential.expires_at)}
                        {expiryStatus(credential.expires_at) === "soon" && (
                          <Badge
                            variant="outline"
                            className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                          >
                            expires soon
                          </Badge>
                        )}
                        {expiryStatus(credential.expires_at) === "expired" && (
                          <Badge variant="destructive">expired</Badge>
                        )}
                      </span>
                    )}
                    {credential.last_rotated_at && <span>Rotated: {formatDate(credential.last_rotated_at)}</span>}
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
