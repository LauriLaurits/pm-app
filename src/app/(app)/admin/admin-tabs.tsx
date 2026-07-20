import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "users", href: "/admin/users", label: "Users" },
  { key: "access", href: "/admin/access", label: "Access" },
] as const;

/** Lightweight route-based tab bar shared by the two admin screens -- both are separate pages
 * (not client-side tab panels), so this is just styled Links with an active indicator, not the
 * shadcn Tabs primitive (which manages panel state within a single page). Keeps the two related
 * admin screens discoverable from each other without folding them into one mega-page or adding a
 * second top-level nav item (the "User access" nav item still points at /admin/users). */
export function AdminTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav className="flex gap-1 border-b" aria-label="Admin sections">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            tab.key === active
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
