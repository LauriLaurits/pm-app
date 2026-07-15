import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function UpdateBody({ update }: { update: StatusUpdateRow }) {
  return (
    <div className="space-y-3">
      {update.handover_info && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium tracking-wide text-amber-700 uppercase dark:text-amber-400">
            <Badge variant="destructive">Handover</Badge>
          </div>
          <p className="text-sm whitespace-pre-wrap">{update.handover_info}</p>
        </div>
      )}
      <UpdateField label="Completed" value={update.completed} />
      <UpdateField label="In progress" value={update.in_progress} />
      <UpdateField label="Blockers" value={update.blockers} />
      <UpdateField label="Decisions needed" value={update.decisions_needed} />
      <UpdateField label="Next milestone" value={update.next_milestone} />
    </div>
  );
}

export function StatusHistory({ updates }: { updates: StatusUpdateRow[] }) {
  if (updates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Status updates</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No status updates yet.</p>
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
