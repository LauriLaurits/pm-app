"use client";

import { useState } from "react";
import { archiveProjectAction, deleteProjectAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ProjectRow } from "./types";

/** Archive (soft-delete, any edit_project holder) and hard-delete (admin-only) affordances.
 * Renders nothing if the caller can do neither -- page.tsx only computes these props at all
 * for callers who might. Both mutations are wrapped in ConfirmDialog with explicit, heavy
 * copy given how destructive a hard delete is. */
export function ProjectDangerZone({
  projectId,
  status,
  canArchive,
  canDelete,
}: {
  projectId: string;
  status: ProjectRow["status"];
  canArchive: boolean;
  canDelete: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  if (!canArchive && !canDelete) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Danger zone</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {canArchive && status !== "archived" && (
          <ConfirmDialog
            trigger={<Button size="sm" variant="outline" />}
            triggerLabel="Archive project"
            title="Archive this project?"
            description="The project is retired from active use but stays fully visible, clearly marked as archived. This is reversible -- change its status back via Edit project at any time."
            confirmLabel="Archive"
            pendingLabel="Archiving…"
            onConfirm={async () => {
              const result = await archiveProjectAction(projectId);
              if ("error" in result) setError(result.error);
              return result;
            }}
          />
        )}
        {canDelete && (
          <ConfirmDialog
            trigger={<Button size="sm" variant="destructive" />}
            triggerLabel="Delete permanently"
            title="Permanently delete this project?"
            description="This permanently deletes the project and ALL its data -- parts, budgets, links, credentials, members, and time entries tied to it. This cannot be undone."
            confirmLabel="Delete permanently"
            pendingLabel="Deleting…"
            onConfirm={async () => {
              const result = await deleteProjectAction(projectId);
              if (result && "error" in result) setError(result.error);
              return result;
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
