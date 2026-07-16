"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Overview", segment: "" },
  { label: "Parts", segment: "/parts" },
  { label: "People", segment: "/people" },
  { label: "Links", segment: "/links" },
  { label: "Credentials", segment: "/credentials" },
];

export function TabNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  return (
    <nav className="flex gap-1 border-b">
      {TABS.map((tab) => {
        const href = `${base}${tab.segment}`;
        const isActive = pathname === href;
        return (
          <Link
            key={tab.label}
            href={href}
            className={cn(
              "border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              isActive && "border-foreground text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
