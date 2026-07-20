import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectRow } from "./types";

function NoteField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <p className="text-sm whitespace-pre-wrap">{value}</p>
    </div>
  );
}

// Standing risks/notes only -- blockers and next steps moved to status updates. Renders NOTHING
// when there's nothing recorded (an empty "No risks recorded" card is just noise); editors add
// content through the project's Edit dialog, so there's no lost affordance.
export function OverviewNotesCard({ project }: { project: ProjectRow }) {
  const fields = (
    [
      { label: "Risks", value: project.risks },
      { label: "Internal notes", value: project.internal_notes },
      { label: "Client notes", value: project.client_notes },
    ] satisfies { label: string; value: string | null }[]
  ).filter((field): field is { label: string; value: string } => !!field.value);

  if (fields.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Risks &amp; notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.map((field) => (
          <NoteField key={field.label} {...field} />
        ))}
      </CardContent>
    </Card>
  );
}
