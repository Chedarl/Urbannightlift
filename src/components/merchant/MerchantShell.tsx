"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Store, Tag, TrendingUp, Settings2, LogOut } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { Logo } from "@/components/shared/Logo";
import { LanguageSwitch } from "@/components/shared/LanguageSwitch";
import { PageGuide } from "@/components/shared/PageGuide";
import { InstallPrompt } from "@/components/shared/InstallPrompt";
import { cn } from "@/lib/utils";

/**
 * The merchant app's chrome, built from the same parts as the customer portal.
 *
 * A merchant is a customer of a different product, so they get the same shell,
 * the same bottom bar and the same design kit rather than a lesser version of
 * the app. Everything they might want to change existed already — it was just
 * locked behind /admin, so a shop had to phone the owner to correct a price.
 */

const TABS = [
  { href: "/merchant", icon: Store, en: "Tonight", fr: "Ce soir" },
  { href: "/merchant/products", icon: Tag, en: "Items", fr: "Articles" },
  { href: "/merchant/insights", icon: TrendingUp, en: "Insights", fr: "Chiffres" },
  { href: "/merchant/profile", icon: Settings2, en: "Shop", fr: "Boutique" },
] as const;

export function MerchantShell({
  merchantName,
  children,
}: {
  merchantName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale } = useTranslation();
  const fr = locale === "fr";

  async function signOut() {
    await fetch("/api/merchant-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    router.push("/merchant/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-ink-700/60 bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2 px-4 py-3">
          <Link href="/merchant">
            <Logo compact />
          </Link>
          <span className="truncate text-sm font-medium text-mist-300">{merchantName}</span>
          <div className="flex items-center gap-1">
            <LanguageSwitch />
            <PageGuide />
            <button
              type="button"
              onClick={signOut}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-mist-500 hover:bg-ink-800"
              aria-label={fr ? "Se déconnecter" : "Log out"}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-6 pb-28">
        <InstallPrompt className="mb-4 w-full" />
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700/60 bg-ink-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-stretch">
          {TABS.map(({ href, icon: Icon, en, fr: frLabel }) => {
            // "/merchant" would otherwise light up on every child route.
            const active = href === "/merchant" ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-gold-400" : "text-mist-500 hover:text-mist-300"
                )}
              >
                <Icon className="h-5 w-5" />
                {fr ? frLabel : en}
              </Link>
            );
          })}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  );
}
