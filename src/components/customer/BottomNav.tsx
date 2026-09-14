"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ShoppingBag, MapPin, LifeBuoy, UserCircle } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function BottomNav({ signedIn = false }: { signedIn?: boolean }) {
  const { t } = useTranslation();
  const pathname = usePathname();

  // One home. For a signed-in customer, "Home" is the portal (`/account`), not
  // the public marketing page — so the app has a single home and Home never
  // ejects them to the brochure. "Account" then points at the profile/settings
  // hub, so Home and Account are distinct destinations rather than two tabs to
  // the same place. Guests keep the marketing page as Home and are sent to
  // sign-in from the Account tab.
  const homeHref = signedIn ? "/account" : "/";
  const homeActive = signedIn ? pathname === "/account" : pathname === "/";
  const accountHref = signedIn ? "/account/profile" : "/account/login";
  // The portal dashboard is `/account` (Home); everything under `/account/…`
  // is account management (profile, orders, addresses, settings, referrals).
  const accountActive = signedIn
    ? pathname.startsWith("/account/")
    : pathname.startsWith("/account/login") || pathname.startsWith("/account/signup");

  const items = [
    { href: homeHref, icon: Home, label: t("nav.home"), active: homeActive },
    { href: "/order", icon: ShoppingBag, label: t("nav.order"), active: pathname.startsWith("/order") },
    { href: "/track", icon: MapPin, label: t("nav.track"), active: pathname === "/track" },
    // Help now stays in-app rather than handing off to WhatsApp — the same
    // move as removing the WhatsApp hand-off from the order screen.
    { href: "/help", icon: LifeBuoy, label: t("nav.help"), active: pathname.startsWith("/help") },
    { href: accountHref, icon: UserCircle, label: t("nav.account"), active: accountActive },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]">
      <div className="glass mx-auto flex max-w-lg items-center justify-around border-t border-x-0 border-b-0 px-2 py-2">
        {items.map(({ href, icon: Icon, label, active }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-xs font-medium transition-colors",
              active ? "text-gold-400" : "text-mist-500 hover:text-mist-300"
            )}
          >
            <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_6px_rgba(212,175,55,0.6)]")} />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
