"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bike, Wallet, User } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * The rider app's bottom bar.
 *
 * There was no navigation of any kind before this. The rider shell rendered a
 * header and the page, so `/rider/profile` — where the photo and plate a
 * customer identifies them by are set — was reachable only by typing the URL,
 * and a rider had no way back from an order except the browser's back button.
 * The customer portal has had a bottom bar since v9; this is the same idea, and
 * it is most of what "as good as the client portal" means in practice.
 */

const TABS = [
  { href: "/rider/dashboard", icon: Bike, en: "Tonight", fr: "Ce soir" },
  { href: "/rider/earnings", icon: Wallet, en: "Earnings", fr: "Gains" },
  { href: "/rider/profile", icon: User, en: "Profile", fr: "Profil" },
] as const;

export function RiderNav() {
  const pathname = usePathname();
  const { locale } = useTranslation();
  const fr = locale === "fr";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700/60 bg-ink-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-stretch">
        {TABS.map(({ href, icon: Icon, en, fr: frLabel }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors",
                active ? "text-gold-400" : "text-mist-500 hover:text-mist-300"
              )}
            >
              <Icon className="h-5 w-5" />
              {fr ? frLabel : en}
            </Link>
          );
        })}
      </div>
      {/* Clears the home indicator on iPhones in standalone mode. */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
