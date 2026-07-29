"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { KeyRoundIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { avatarTint } from "@/lib/avatar-tint";
import { formatDate, humanize, initials } from "../projects/types";
import { MASK, VISIBILITY_BADGE, expiryStatus, groupByEnvironment } from "@/lib/credentials-display";
// Reused, not rebuilt -- the only place a secret is ever fetched/held client-side. Mounted here
// exactly like the project-scoped tab: only for rows in a project this caller holds
// reveal_credential on (see canReveal per ProjectCredentialGroup, computed in page.tsx).
import { CredentialRevealControl } from "../projects/[id]/credentials/credential-reveal-control";
import type { ProjectCredentialGroup } from "./types";

/** Thin client wrapper: owns the search box's local state and does the client-side name/project
 * filtering (list is small, same pattern as ClientsTable/BudgetPortfolioTable). The StatCard
 * totals and subtitle strip in page.tsx are computed from the full, unfiltered `groups` prop, so
 * typing in the search box never touches them -- filtering only ever narrows what renders below.
 * It never changes WHICH rows get a CredentialRevealControl mounted: that's `canReveal`, computed
 * server-side per project and passed straight through untouched by `q`. */
export function CredentialsIndexList({ groups }: { groups: ProjectCredentialGroup[] }) {
  const [q, setQ] = useState("");

  const filteredGroups = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return groups;
    return groups
      .map((group) => {
        // A project-name match keeps every credential in the group; otherwise each credential is
        // matched on its own name.
        const projectMatches = group.projectName.toLowerCase().includes(query);
        const credentials = projectMatches
          ? group.credentials
          : group.credentials.filter((c) => c.name.toLowerCase().includes(query));
        return { ...group, credentials };
      })
      .filter((group) => group.credentials.length > 0);
  }, [groups, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search credentials or projects…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="mr-3 w-84 rounded-full border-transparent bg-muted/60 shadow-none"
        />
        {q.trim() && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setQ("")}
            className="rounded-full bg-red-500/8 text-red-700 hover:bg-red-500/15 hover:text-red-800 dark:bg-red-500/15 dark:text-red-400 dark:hover:bg-red-500/25"
          >
            <XIcon /> Clear
          </Button>
        )}
      </div>

      {filteredGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No credentials match your search.
        </div>
      ) : (
        <div className="space-y-8">
          {filteredGroups.map((group) => (
            <ProjectGroup key={group.projectId} group={group} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectGroup({ group }: { group: ProjectCredentialGroup }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-medium ${avatarTint(group.projectName)}`}
          >
            {initials(group.projectName)}
          </span>
          <Link
            href={`/projects/${group.projectId}`}
            className="text-lg font-semibold transition-opacity hover:opacity-70"
          >
            {group.projectName}
          </Link>
        </div>
        <Button
          variant="outline"
          size="sm"
          render={<Link href={`/projects/${group.projectId}/credentials`} />}
        >
          Manage on project
        </Button>
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
          <span className="text-sm font-semibold">{credential.name}</span>
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
