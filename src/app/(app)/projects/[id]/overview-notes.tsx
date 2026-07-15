import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProjectRow } from "./types";

function NoteField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <p className="text-sm whitespace-pre-wrap">
        {value ?? <span className="text-muted-foreground">—</span>}
      </p>
    </div>
  );
}

export function OverviewNotesCard({ project }: { project: ProjectRow }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Risks & notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <NoteField label="Risks" value={project.risks} />
        <NoteField label="Blockers" value={project.blockers} />
        <NoteField label="Next steps" value={project.next_steps} />
        <NoteField label="Internal notes" value={project.internal_notes} />
        <NoteField label="Client notes" value={project.client_notes} />
      </CardContent>
    </Card>
  );
}
