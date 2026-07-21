import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { UserMenu } from "./user-menu";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  const isAdmin = current.role === "admin";

  // Topbar avatar: the viewer's people-directory photo if they have one (RLS: view_people is
  // global for every seeded role, and a missing row just falls back to tinted initials).
  const supabase = await createClient();
  const { data: me } = await supabase
    .from("people")
    .select("avatar_url")
    .eq("user_id", current.user.id)
    .maybeSingle();

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar isAdmin={isAdmin} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
          </div>
          <UserMenu
            name={current.profile.full_name ?? current.profile.email}
            email={current.profile.email}
            avatarUrl={me?.avatar_url}
          />
        </header>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
