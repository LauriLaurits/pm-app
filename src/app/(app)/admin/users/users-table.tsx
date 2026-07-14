import { Badge } from "@/components/ui/badge";
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

export function UsersTable({ users }: { users: UserRow[] }) {
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
            <TableCell>{user.role?.replace("_", " ") ?? "—"}</TableCell>
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
