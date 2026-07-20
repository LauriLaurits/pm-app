import { requireAdmin } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AdminTabs } from "../admin-tabs";
import { UsersTable } from "./users-table";

export default async function AdminUsersPage() {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const { data: users, error } = await supabase
    .from("user_profiles")
    .select(
      "id, email, full_name, status, created_at, user_roles!user_roles_user_id_fkey(role_key)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <p className="text-destructive">Failed to load users: {error.message}</p>
    );
  }

  const rows = (users ?? []).map(({ user_roles, ...rest }) => ({
    ...rest,
    role: user_roles?.[0]?.role_key ?? null,
  }));

  return (
    <div className="space-y-4">
      <AdminTabs active="users" />
      <h1 className="text-2xl font-semibold">User access</h1>
      <UsersTable users={rows} currentUserId={admin.user.id} />
    </div>
  );
}
