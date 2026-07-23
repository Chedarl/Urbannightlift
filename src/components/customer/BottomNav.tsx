"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ShoppingBag, MapPin, MessageCircle } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { buildWaLink, MAIN_WHATSAPP_NUMBER } from "@/lib/whatsapp/links";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const { t, locale } = useTranslation();
  const pathname = usePathname();
  const greeting =
    locale === "fr"
      ? "Bonsoir, je souhaite passer une commande Urban Night Lift."
      : "Good evening, I would like to place an Urban Night Lift order.";

  const items = [
    { href: "/", icon: Home, label: t("nav.home"), active: pathname === "/" },
    { href: "/order", icon: ShoppingBag, label: t("nav.order"), active: pathname.startsWith("/order") },
    { href: "/track", icon: MapPin, label: t("nav.track"), active: pathname === "/track" },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]">
      <div className="glass mx-auto flex max-w-lg items-center justify-around border-t border-x-0 border-b-0 px-2 py-2">
        {items.map(({ href, icon: Icon, label, active }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition-colors",
              active ? "text-gold-400" : "text-mist-500 hover:text-mist-300"
            )}
          >
            <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_6px_rgba(212,175,55,0.6)]")} />
            {label}
          </Link>
        ))}
        <a
          href={buildWaLink(MAIN_WHATSAPP_NUMBER, greeting)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium text-mist-500 transition-colors hover:text-[#25D366]"
        >
          <MessageCircle className="h-5 w-5" />
          {t("nav.help")}
        </a>
      </div>
    </nav>
  );
}
