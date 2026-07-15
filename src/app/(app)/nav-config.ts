import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Gauge,
  Wallet,
  KeyRound,
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
  { label: "People", href: "/people", icon: Users },
  { label: "Workload", href: "/workload", icon: Gauge, comingSoon: true },
  { label: "Budgets", href: "/budgets", icon: Wallet, comingSoon: true },
  {
    label: "Credentials",
    href: "/credentials",
    icon: KeyRound,
    comingSoon: true,
  },
  { label: "Activity", href: "/activity", icon: Activity, comingSoon: true },
  {
    label: "User access",
    href: "/admin/users",
    icon: ShieldCheck,
    adminOnly: true,
  },
  { label: "Settings", href: "/settings", icon: Settings },
];
