import { ProjectCreateDialog } from "../projects/project-create-dialog";
import { LogTimeDialog } from "../people/[id]/log-time-dialog";
import type {
  ClientContactOption,
  ClientOption,
  PmOption,
} from "../projects/new/project-create-fields";
import type { AssignedProjectOption, PartOption } from "../people/[id]/types";
import { greetingWord } from "./greeting";

export type CreateProjectProps = {
  clients: ClientOption[];
  contacts: ClientContactOption[];
  pms: PmOption[];
  currentUserId: string;
};

export type LogTimeProps = {
  projects: AssignedProjectOption[];
  partsByProject: Record<string, PartOption[]>;
};

/** Greeting + quick actions, right-aligned and wrapping under the greeting on narrow screens.
 * `createProps`/`logTimeProps` are null when the respective action should not render at all --
 * the gating (create_project permission / a loggable person row) already happened server-side
 * in page.tsx, this component only decides layout. */
export function DashboardHeader({
  name,
  canCreate,
  createProps,
  logTimeProps,
}: {
  name: string;
  canCreate: boolean;
  createProps: CreateProjectProps | null;
  logTimeProps: LogTimeProps | null;
}) {
  const greeting = greetingWord(new Date().getHours());
  const greetingLabel = `Good ${greeting}`;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">
          {greetingLabel}, {name} 👋
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening with your projects today.
        </p>
      </div>
      {(canCreate && createProps) || logTimeProps ? (
        <div className="flex flex-wrap items-center gap-2">
          {logTimeProps && (
            <LogTimeDialog projects={logTimeProps.projects} partsByProject={logTimeProps.partsByProject} />
          )}
          {canCreate && createProps && (
            <ProjectCreateDialog
              clients={createProps.clients}
              contacts={createProps.contacts}
              pms={createProps.pms}
              currentUserId={createProps.currentUserId}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
