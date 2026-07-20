import { updateMemberRoleAction } from "@/app/actions/project-members";
import { setPersonAllocationAction } from "@/app/actions/project-people";
import { pctToDays } from "@/lib/allocation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { InlineEditText } from "@/components/inline-edit-text";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatDate, initials } from "../../types";
import { MemberRemoveButton } from "./member-actions";
import { MemberEditDialog } from "./member-edit-dialog";
import type { MemberRow } from "./types";

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
          <TableHead>Role on project</TableHead>
          <TableHead>Allocation (days/wk)</TableHead>
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
                <Avatar size="sm">
                  <AvatarImage src={member.avatar_url ?? undefined} alt={member.full_name ?? ""} />
                  <AvatarFallback>{initials(member.full_name)}</AvatarFallback>
                </Avatar>
                <span className="font-medium">{member.full_name ?? "Unknown"}</span>
              </div>
            </TableCell>
            <TableCell>
              <InlineEditText
                value={member.role_on_project}
                canEdit={canManage}
                ariaLabel="role on project"
                onSave={updateMemberRoleAction.bind(null, projectId, member.id)}
              />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <InlineEditText
                  value={member.allocation_pct != null ? String(pctToDays(member.allocation_pct)) : ""}
                  canEdit={canManage}
                  ariaLabel="allocation days per week"
                  placeholder={canManage ? "Set days" : "—"}
                  className={canManage ? "underline decoration-dotted underline-offset-4" : undefined}
                  onSave={setPersonAllocationAction.bind(null, projectId, member.user_id)}
                />
                {member.allocation_pct != null && <span className="text-muted-foreground">days/wk</span>}
              </div>
            </TableCell>
            <TableCell>{formatDate(member.starts_on)}</TableCell>
            <TableCell>{formatDate(member.ends_on)}</TableCell>
            {canManage && (
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
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
