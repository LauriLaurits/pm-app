import type { Database } from "@/lib/database.types";

export type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
export type StatusUpdateRow = Database["public"]["Tables"]["project_status_updates"]["Row"];

export type PersonRef = {
  full_name: string;
  avatar_url: string | null;
} | null;
