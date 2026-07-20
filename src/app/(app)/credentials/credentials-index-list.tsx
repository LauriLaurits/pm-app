import Link from "next/link";
import { KeyRoundIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate, humanize } from "../projects/types";
import { MASK, VISIBILITY_BADGE, expiryStatus, groupByEnvironment } from "@/lib/credentials-display";
// Reused, not rebuilt -- the only place a secret is ever fetched/held client-side. Mounted here
// exactly like the project-scoped tab: only for rows in a project this caller holds
// reveal_credential on (see canReveal per ProjectCredentialGroup, computed in page.tsx).
import { CredentialRevealControl } from "../projects/[id]/credentials/credential-reveal-control";
import type { ProjectCredentialGroup } from "./types";

export function CredentialsIndexList({ groups }: { groups: ProjectCredentialGroup[] }) {
  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group.projectId} className="space-y-3">
          <div className="flex items-center justify-between gap-2 border-b pb-2">
            <h2 className="text-lg font-semibold">{group.projectName}</h2>
            <Link
              href={`/projects/${group.projectId}/credentials`}
              className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Manage on project
            </Link>
          </div>
          {groupByEnvironment(group.credentials).map(([environment, creds]) => (
            <div key={environment} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">{humanize(environment)}</h3>
              <div className="space-y-2">
                {creds.map((credential) => (
                  <CredentialRow key={credential.id} credential={credential} canReveal={group.canReveal} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CredentialRow({
  credential,
  canReveal,
}: {
  credential: ProjectCredentialGroup["credentials"][number];
  canReveal: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{credential.name}</span>
          <Badge variant="outline">{humanize(credential.type)}</Badge>
          <Badge variant={VISIBILITY_BADGE[credential.visibility]}>{humanize(credential.visibility)}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {credential.username && <span>User: {credential.username}</span>}
          {canReveal ? (
            <CredentialRevealControl projectId={credential.project_id} credentialId={credential.id} />
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
                <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                  expires soon
                </Badge>
              )}
              {expiryStatus(credential.expires_at) === "expired" && <Badge variant="destructive">expired</Badge>}
            </span>
          )}
          {credential.owner_name && <span>Owner: {credential.owner_name}</span>}
        </div>
      </div>
    </div>
  );
}
