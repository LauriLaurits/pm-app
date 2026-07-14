import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { UsersTable } from "./users-table";

export default async function AdminUsersPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: users, error } = await supabase
    .from("user_profiles")
    .select("id, email, full_name, status, role, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <p className="text-destructive">Failed to load users: {error.message}</p>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">User access</h1>
      <UsersTable users={users ?? []} />
    </div>
  );
}
