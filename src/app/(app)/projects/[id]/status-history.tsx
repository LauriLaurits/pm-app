import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusUpdateActions } from "./status-update-actions";
import type { StatusUpdateRow } from "./types";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function UpdateField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <p className="text-sm whitespace-pre-wrap">{value}</p>
    </div>
  );
}

const UPDATE_FIELDS: { name: keyof StatusUpdateRow; label: string }[] = [
  { name: "completed", label: "Completed" },
  { name: "in_progress", label: "In progress" },
  { name: "blockers", label: "Blockers" },
  { name: "decisions_needed", label: "Decisions needed" },
  { name: "next_milestone", label: "Next milestone" },
];

function UpdateBody({ update }: { update: StatusUpdateRow }) {
  return (
    <div className="space-y-4">
      {update.handover_info && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 dark:border-amber-500/40 dark:bg-amber-500/15">
          <div className="mb-1 text-xs font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400">
            Handover
          </div>
          <p className="text-sm whitespace-pre-wrap">{update.handover_info}</p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {UPDATE_FIELDS.map(({ name, label }) => (
          <UpdateField key={name} label={label} value={update[name] as string | null} />
        ))}
      </div>
    </div>
  );
}

export function StatusHistory({
  projectId,
  updates,
  postAction,
  currentUserId,
  isAdmin,
}: {
  projectId: string;
  updates: StatusUpdateRow[];
  postAction?: React.ReactNode;
  /** Author of the per-update Edit/Delete menu is decided by comparing this against each
   * update's author_id; null (signed-out, shouldn't happen behind the app layout) means no
   * update is ever "mine". */
  currentUserId: string | null;
  /** Admins can delete (never edit) any update -- see status-update-actions.tsx. */
  isAdmin: boolean;
}) {
  if (updates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Status updates</CardTitle>
          {postAction && <CardAction>{postAction}</CardAction>}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No status updates yet.{postAction ? " Post the first one to record where things stand." : ""}
          </p>
        </CardContent>
      </Card>
    );
  }

  const [latest, ...history] = updates;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Latest status update</CardTitle>
        <div className="group flex items-center gap-1">
          <p className="text-xs text-muted-foreground">{formatDateTime(latest.created_at)}</p>
          <StatusUpdateActions
            projectId={projectId}
            update={latest}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
          />
        </div>
        {postAction && <CardAction>{postAction}</CardAction>}
      </CardHeader>
      <CardContent className="space-y-4">
        <UpdateBody update={latest} />

        {history.length > 0 && (
          <Accordion className="border-t pt-2">
            {history.map((update) => (
              <AccordionItem key={update.id} value={String(update.id)}>
                {/* The actions menu is a SIBLING of AccordionTrigger, never a child -- the
                    trigger renders a <button>, and nesting another interactive control (or even
                    just relying on stopPropagation) inside a button is unreliable/invalid HTML.
                    Rendered outside, clicking it can never bubble into the trigger's own click
                    handler, so it can't toggle the accordion. */}
                <div className="group grid grid-cols-[1fr_auto] items-center gap-1">
                  <AccordionTrigger>{formatDateTime(update.created_at)}</AccordionTrigger>
                  <StatusUpdateActions
                    projectId={projectId}
                    update={update}
                    currentUserId={currentUserId}
                    isAdmin={isAdmin}
                  />
                </div>
                <AccordionContent>
                  <UpdateBody update={update} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
