import Link from "next/link";
import { updateMemberRoleAction } from "@/app/actions/project-members";
import { PersonAvatar } from "@/components/person-avatar";
import { InlineEditText } from "@/components/inline-edit-text";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatDate } from "../../types";
import { AddPeriodDialog } from "./add-period-dialog";
import { MemberRemoveButton } from "./member-actions";
import { MemberEditDialog } from "./member-edit-dialog";
import type { MemberRow } from "./types";

// One row per membership PERIOD -- the same person can appear several times (member periods),
// so the name/avatar cell repeating is expected. Allocation deliberately has no column here:
// assignments/workload plumbing stays in the DB (workload reads it) but this tab no longer
// shows or writes it.
export function MembersTable({
  members,
  projectId,
  canManage,
}: {
  members: MemberRow[];
  projectId: string;
  canManage: boolean;
}) {
  if (members.length === 0) {
    return <p className="text-muted-foreground">No members yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Starts</TableHead>
          <TableHead>Ends</TableHead>
          {canManage && <TableHead className="text-right">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member.id}>
            <TableCell>
              <div className="flex items-center gap-2">
                <PersonAvatar name={member.full_name} avatarUrl={member.avatar_url} className="size-8" />
                {member.person_id ? (
                  <Link href={`/people/${member.person_id}`} className="font-medium hover:underline">
                    {member.full_name ?? "Unknown"}
                  </Link>
                ) : (
                  <span className="font-medium">{member.full_name ?? "Unknown"}</span>
                )}
              </div>
            </TableCell>
            <TableCell>
              <InlineEditText
                value={member.role_on_project}
                canEdit={canManage}
                ariaLabel="role"
                onSave={updateMemberRoleAction.bind(null, projectId, member.id)}
              />
            </TableCell>
            <TableCell>{formatDate(member.starts_on)}</TableCell>
            <TableCell>{formatDate(member.ends_on)}</TableCell>
            {canManage && (
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <AddPeriodDialog projectId={projectId} member={member} />
                  <MemberEditDialog projectId={projectId} member={member} />
                  <MemberRemoveButton projectId={projectId} member={member} />
                </div>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
