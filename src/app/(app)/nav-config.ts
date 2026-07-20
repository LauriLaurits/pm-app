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
  { label: "People", href: "/people", icon: Users },
  { label: "Workload", href: "/workload", icon: Gauge },
  { label: "Budgets", href: "/budgets", icon: Wallet },
  {
    label: "Credentials",
    href: "/credentials",
    icon: KeyRound,
    comingSoon: true,
  },
  { label: "Delegations", href: "/delegations", icon: ArrowRightLeft },
  { label: "Activity", href: "/activity", icon: Activity, comingSoon: true },
  {
    label: "User access",
    href: "/admin/users",
    icon: ShieldCheck,
    adminOnly: true,
  },
  { label: "Settings", href: "/settings", icon: Settings },
];
