import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatDate, initials } from "../../types";
import { MemberRemoveButton } from "./member-actions";
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
          <TableHead>Allocation</TableHead>
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
            <TableCell>{member.role_on_project ?? "—"}</TableCell>
            <TableCell>{member.allocation_pct != null ? `${member.allocation_pct}%` : "—"}</TableCell>
            <TableCell>{formatDate(member.starts_on)}</TableCell>
            <TableCell>{formatDate(member.ends_on)}</TableCell>
            {canManage && (
              <TableCell className="text-right">
                <MemberRemoveButton projectId={projectId} member={member} />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
