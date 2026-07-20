import { changeUserRoleAction } from "@/app/actions/admin";
import { APP_ROLES } from "@/lib/validation/auth";
import { Badge } from "@/components/ui/badge";
import { InlineEditSelect, type InlineEditOption } from "@/components/inline-edit-select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ApproveDialog } from "./approve-dialog";
import { UserActions } from "./user-actions";

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  status: "pending" | "active" | "disabled";
  role: string | null;
  created_at: string;
};

const statusVariant = {
  pending: "secondary",
  active: "default",
  disabled: "destructive",
} as const;

const ROLE_INLINE_OPTIONS: InlineEditOption[] = APP_ROLES.map((r) => ({
  value: r,
  label: r.replace("_", " "),
  badgeVariant: "outline",
}));

export function UsersTable({
  users,
  currentUserId,
}: {
  users: UserRow[];
  /** The viewing admin's own id -- self role-change is disabled here (and rejected server-side
   * by changeUserRoleAction) so an admin can never accidentally lock themselves out. */
  currentUserId: string | null;
}) {
  if (users.length === 0) {
    return <p className="text-muted-foreground">No users yet.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Joined</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell>
              <div className="font-medium">{user.full_name ?? "—"}</div>
              <div className="text-sm text-muted-foreground">{user.email}</div>
            </TableCell>
            <TableCell>
              <Badge variant={statusVariant[user.status]}>{user.status}</Badge>
            </TableCell>
            <TableCell>
              {user.status === "pending" || !user.role ? (
                user.role?.replace("_", " ") ?? "—"
              ) : (
                <InlineEditSelect
                  value={user.role}
                  options={ROLE_INLINE_OPTIONS}
                  canEdit={user.id !== currentUserId}
                  ariaLabel="user role"
                  onSave={changeUserRoleAction.bind(null, user.id)}
                />
              )}
            </TableCell>
            <TableCell>
              {new Date(user.created_at).toLocaleDateString()}
            </TableCell>
            <TableCell className="text-right">
              {user.status === "pending" ? (
                <ApproveDialog userId={user.id} userLabel={user.full_name ?? user.email} />
              ) : (
                <UserActions userId={user.id} status={user.status} />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
