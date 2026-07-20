import { KeyRoundIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate, humanize } from "../../types";
import { CredentialDeleteButton } from "./credential-actions";
import { CredentialFormDialog } from "./credential-form-dialog";
import { CredentialRevealControl } from "./credential-reveal-control";
import type { DisplayCredentialRow } from "./types";

const VISIBILITY_BADGE: Record<DisplayCredentialRow["visibility"], "outline" | "secondary" | "destructive"> = {
  project_members: "outline",
  pms_only: "secondary",
  admins_only: "destructive",
};

// The plain mask shown to everyone who lacks `reveal_credential` on this project -- the real
// secret is never fetched for them at all (not even in a hidden field): CredentialRevealControl,
// which is the only thing that ever holds plaintext client-side, is never mounted for these rows.
const MASK = "••••••••••••";

const EXPIRY_SOON_DAYS = 14;

/** null = not near expiry; "soon" = within EXPIRY_SOON_DAYS; "expired" = already past. Display
 * only -- never gates access, RLS/has_permission already own that. */
function expiryStatus(expiresAt: string | null): "soon" | "expired" | null {
  if (!expiresAt) return null;
  const days = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return "expired";
  if (days <= EXPIRY_SOON_DAYS) return "soon";
  return null;
}

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
