"use server";

import { requireActiveUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { escapeIlike } from "@/lib/search";

export type SearchResultItem = {
  id: string;
  label: string;
  sublabel?: string | null;
  href: string;
};

export type SearchSection = {
  section: "Projects" | "Clients" | "Employees";
  items: SearchResultItem[];
};

const LIMIT = 5;

/** Global header search: three parallel RLS-scoped `ilike` lookups (projects/clients/people)
 * plus a fourth over client_contacts whose matches resolve to their parent client and merge/dedupe
 * into the Clients group -- a contact-name match still surfaces the client the viewer would
 * actually navigate to. RLS on each table is the only permission boundary here (same idiom as the
 * rest of the dashboard reads); this action does no manual visibility filtering of its own. */
export async function globalSearchAction(q: string): Promise<{ results: SearchSection[] }> {
  await requireActiveUser();

  const trimmed = q.trim();
  if (trimmed.length < 2) return { results: [] };

  const pattern = `%${escapeIlike(trimmed)}%`;
  const supabase = await createClient();

  const [projectsRes, clientsRes, peopleRes, contactsRes] = await Promise.all([
    supabase.from("projects").select("id, name, status").ilike("name", pattern).order("name").limit(LIMIT),
    supabase.from("clients").select("id, name").ilike("name", pattern).order("name").limit(LIMIT),
    supabase
      .from("people")
      .select("id, full_name, role_title, avatar_url")
      .ilike("full_name", pattern)
      .order("full_name")
      .limit(LIMIT),
    supabase
      .from("client_contacts")
      .select("id, name, clients(id, name)")
      .ilike("name", pattern)
      .order("name")
      .limit(LIMIT),
  ]);

  const results: SearchSection[] = [];

  const projectItems: SearchResultItem[] = (projectsRes.data ?? []).map((p) => ({
    id: p.id,
    label: p.name,
    sublabel: p.status,
    href: `/projects/${p.id}`,
  }));
  if (projectItems.length > 0) results.push({ section: "Projects", items: projectItems });

  // Clients group: direct name matches first, then contact-name matches resolved to their parent
  // client, deduped by client id so a client that matches both ways (or via >1 contact) appears
  // once -- contact matches carry a "contact: {name}" sublabel so it's clear why they surfaced.
  const clientItems: SearchResultItem[] = [];
  const seenClientIds = new Set<string>();
  for (const c of clientsRes.data ?? []) {
    if (seenClientIds.has(c.id)) continue;
    seenClientIds.add(c.id);
    clientItems.push({ id: c.id, label: c.name, sublabel: null, href: `/clients/${c.id}` });
  }
  for (const contact of contactsRes.data ?? []) {
    const client = contact.clients;
    if (!client || seenClientIds.has(client.id)) continue;
    seenClientIds.add(client.id);
    clientItems.push({
      id: client.id,
      label: client.name,
      sublabel: `contact: ${contact.name}`,
      href: `/clients/${client.id}`,
    });
  }
  // Direct matches + contact-resolved matches combined can exceed LIMIT (up to 5 + 5 before
  // dedup) -- cap the merged group at LIMIT same as every other section.
  if (clientItems.length > 0) results.push({ section: "Clients", items: clientItems.slice(0, LIMIT) });

  const peopleItems: SearchResultItem[] = (peopleRes.data ?? []).map((p) => ({
    id: p.id,
    label: p.full_name,
    sublabel: p.role_title,
    href: `/people/${p.id}`,
  }));
  if (peopleItems.length > 0) results.push({ section: "Employees", items: peopleItems });

  return { results };
}
