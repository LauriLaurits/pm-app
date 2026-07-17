import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ClientRowActions } from "./client-row-actions";
import type { ClientListRow } from "./types";

export function ClientsTable({ rows, canManage }: { rows: ClientListRow[]; canManage: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Client</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead>Projects</TableHead>
          {canManage && <TableHead className="text-right">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell className="text-muted-foreground">{row.contact_name ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">{row.contact_email ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">{row.phone ?? "—"}</TableCell>
            <TableCell>
              <Badge variant="outline">{row.project_count}</Badge>
            </TableCell>
            {canManage && (
              <TableCell className="text-right">
                <ClientRowActions client={row} />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
