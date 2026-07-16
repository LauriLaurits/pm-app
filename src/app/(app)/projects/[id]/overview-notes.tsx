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

export function OverviewNotesCard({ project }: { project: ProjectRow }) {
  const fields = (
    [
      { label: "Risks", value: project.risks },
      { label: "Blockers", value: project.blockers },
      { label: "Next steps", value: project.next_steps },
      { label: "Internal notes", value: project.internal_notes },
      { label: "Client notes", value: project.client_notes },
    ] satisfies { label: string; value: string | null }[]
  ).filter((field): field is { label: string; value: string } => !!field.value);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Risks & notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No risks, blockers, or notes recorded.
          </p>
        ) : (
          fields.map((field) => <NoteField key={field.label} {...field} />)
        )}
      </CardContent>
    </Card>
  );
}
