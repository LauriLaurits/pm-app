import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { UserMenu } from "./user-menu";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  const isAdmin = current.profile.role === "admin";

  return (
    <div className="min-h-svh">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="font-semibold">
            PM CMS
          </Link>
          {isAdmin && (
            <Link
              href="/admin/users"
              className="text-muted-foreground hover:text-foreground"
            >
              User access
            </Link>
          )}
        </nav>
        <UserMenu
          name={current.profile.full_name ?? current.profile.email}
          email={current.profile.email}
        />
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
