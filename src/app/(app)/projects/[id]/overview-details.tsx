import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "../types";
import type { ProjectRow } from "./types";

export function OverviewDetailsCard({ project }: { project: ProjectRow }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground">
          {project.description ?? <span className="text-muted-foreground">No description.</span>}
        </p>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Start date</div>
            <div>{formatDate(project.start_date)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Deadline</div>
            <div>{formatDate(project.deadline)}</div>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{project.progress}%</span>
          </div>
          <Progress value={project.progress} />
        </div>

        {project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {project.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
