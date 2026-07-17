"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteClientAction } from "@/app/actions/clients";
import { ClientFormDialog } from "./client-form-dialog";
import type { ClientListRow } from "./types";

/** Managers-only row controls: Edit + a guarded hard-delete. The delete action itself refuses
 * (with a friendly error, surfaced inline by ConfirmDialog) whenever the client still has
 * projects referencing it -- see deleteClientAction and the `projects.client_id` FK, which is
 * the real backstop. */
export function ClientRowActions({ client }: { client: ClientListRow }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <ClientFormDialog client={client} />
      <ConfirmDialog
        trigger={<Button size="sm" variant="ghost" />}
        triggerLabel="Delete"
        title="Delete this client?"
        description={`Delete "${client.name}"? This can't be undone. Clients with projects can't be deleted -- reassign or archive those projects first.`}
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        onConfirm={() => deleteClientAction(client.id)}
      />
    </div>
  );
}
