import {
  LayoutDashboard,
  FolderKanban,
  Building2,
  Users,
  Gauge,
  Wallet,
  KeyRound,
  ArrowRightLeft,
  Activity,
  ShieldCheck,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  comingSoon?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Clients", href: "/clients", icon: Building2 },
  // Client feedback round 1: user-facing name is "Employees" (route stays /people).
  { label: "Employees", href: "/people", icon: Users },
  // comingSoon: temporarily hidden behind a "Soon" badge for the demo — flip back after.
  { label: "Workload", href: "/workload", icon: Gauge, comingSoon: true },
  { label: "Budgets", href: "/budgets", icon: Wallet, comingSoon: true },
  { label: "Credentials", href: "/credentials", icon: KeyRound, comingSoon: true },
  { label: "Delegations", href: "/delegations", icon: ArrowRightLeft, comingSoon: true },
  { label: "Activity", href: "/activity", icon: Activity, comingSoon: true },
  {
    label: "User access",
    href: "/admin/users",
    icon: ShieldCheck,
    adminOnly: true,
    comingSoon: true,
  },
  { label: "Settings", href: "/settings", icon: Settings },
];
