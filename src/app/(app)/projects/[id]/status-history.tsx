import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  updates,
  postAction,
}: {
  updates: StatusUpdateRow[];
  postAction?: React.ReactNode;
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
        <p className="text-xs text-muted-foreground">{formatDateTime(latest.created_at)}</p>
        {postAction && <CardAction>{postAction}</CardAction>}
      </CardHeader>
      <CardContent className="space-y-4">
        <UpdateBody update={latest} />

        {history.length > 0 && (
          <Accordion className="border-t pt-2">
            {history.map((update) => (
              <AccordionItem key={update.id} value={String(update.id)}>
                <AccordionTrigger>{formatDateTime(update.created_at)}</AccordionTrigger>
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
