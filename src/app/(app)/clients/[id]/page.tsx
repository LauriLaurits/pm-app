import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { deadlineCountdown } from "@/lib/deadline";
import { ClientFormDialog } from "../client-form-dialog";
import { STATUS_BADGE, formatDate, humanize } from "../../projects/types";
import type { ProjectListRow } from "../../projects/types";
import type { ClientRow } from "../types";

// Minimal client detail: who they are + every project of theirs the viewer can see. This is the
// destination for every client-name link across the app (projects list, budgets, clients list).
export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS-scoped like /clients: viewers without the clients permission get no row -> 404.
  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle<ClientRow>();
  if (!client) notFound();

  const current = await getCurrentUser();

  // The projects chain (refs -> list rows, via the same gated list view the projects screen
  // uses) and the manage-clients permission check are independent, so they run as one parallel
  // wave (perf feedback: these used to run in series, each adding a full DB round trip to TTFB).
  const [projects, { data: canManage }] = await Promise.all([
    (async () => {
      const { data: projectRefs } = await supabase
        .from("projects")
        .select("id")
        .eq("client_id", id);
      const projectIds = (projectRefs ?? []).map((p) => p.id);
      const { data } = projectIds.length
        ? await supabase
            .from("project_list_rows")
            .select("*")
            .in("id", projectIds)
            .order("updated_at", { ascending: false })
        : { data: [] as ProjectListRow[] };
      return data;
    })(),
    current
      ? supabase.rpc("has_permission", { uid: current.user.id, perm: "manage_clients" })
      : Promise.resolve({ data: false }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/clients" className="hover:underline">
          Clients
        </Link>
        <span>›</span>
        <span className="text-foreground">{client.name}</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{client.name}</h1>
        {canManage && <ClientFormDialog client={client} />}
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-sm">Contact</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          <InfoRow label="Contact person" value={client.contact_name} />
          <InfoRow label="Email" value={client.contact_email} link={client.contact_email ? `mailto:${client.contact_email}` : null} />
          <InfoRow label="Phone" value={client.phone} link={client.phone ? `tel:${client.phone}` : null} />
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Projects ({projects?.length ?? 0})
        </h2>
        {!projects || projects.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No visible projects for this client.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>PM</TableHead>
                <TableHead>Deadline</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => {
                if (!p.id) return null;
                const countdown = deadlineCountdown(p.deadline);
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/projects/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {p.status && (
                        <Badge variant={STATUS_BADGE[p.status]}>{humanize(p.status)}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.pm_name ?? "—"}</TableCell>
                    <TableCell>
                      <span className="text-sm">{formatDate(p.deadline)}</span>{" "}
                      {countdown.days !== null && (
                        <span className={`text-xs ${countdown.toneClass}`}>{countdown.label}</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  link,
}: {
  label: string;
  value: string | null;
  link?: string | null;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {value ? (
        link ? (
          <a href={link} className="hover:underline">
            {value}
          </a>
        ) : (
          <div>{value}</div>
        )
      ) : (
        <div className="text-muted-foreground">—</div>
      )}
    </div>
  );
}
