"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  MapPin,
  Store,
  AlertTriangle,
  Inbox,
  Users2,
  Users,
  Settings,
  Wallet,
  LogOut, Bike,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { Logo } from "@/components/shared/Logo";
import { Megaphone } from "lucide-react";
import { LanguageSwitch } from "@/components/shared/LanguageSwitch";
import { signOutAction } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import type { UserRole } from "@prisma/client";

const NAV = [
  { href: "/admin/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", key: "orders", icon: ClipboardList },
  { href: "/admin/customers", key: "customers", icon: Users2 },
  { href: "/admin/earnings", key: "earnings", icon: Wallet },
  { href: "/admin/zones", key: "zones", icon: MapPin, ownerOnly: true },
  { href: "/admin/merchants", key: "merchants", icon: Store },
  { href: "/admin/ambassadors", key: "ambassadors", icon: Megaphone },
  { href: "/admin/riders/applications", key: "riderApplications", icon: Bike },
  { href: "/admin/complaints", key: "complaints", icon: AlertTriangle },
  { href: "/admin/support", key: "support", icon: Inbox },
  { href: "/admin/users", key: "users", icon: Users, ownerOnly: true },
  { href: "/admin/settings", key: "settings", icon: Settings },
] as const;

export function AdminShell({
  role,
  userName,
  children,
}: {
  role: UserRole;
  userName: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const items = NAV.filter((n) => !("ownerOnly" in n && n.ownerOnly) || role === "OWNER");

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-ink-700/60 bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/admin/dashboard">
            <Logo />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-mist-500 sm:inline">
              {userName} · {t(`admin.users.roles.${role}`)}
            </span>
            <LanguageSwitch />
            <form action={signOutAction}>
              <button
                type="submit"
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-mist-500 hover:bg-ink-800 hover:text-mist-300"
              >
                <LogOut className="h-4 w-4" /> {t("common.logout")}
              </button>
            </form>
          </div>
        </div>
        {/* Nav — scrollable pill row (mobile-first) */}
        <nav className="mx-auto max-w-6xl overflow-x-auto px-4 pb-2">
          <div className="flex gap-1">
            {items.map(({ href, key, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap",
                    active
                      ? "bg-violet-600/25 font-semibold text-violet-300"
                      : "text-mist-500 hover:bg-ink-800 hover:text-mist-300"
                  )}
                >
                  <Icon className="h-4 w-4" /> {t(`admin.nav.${key}`)}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
