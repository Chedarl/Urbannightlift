import Link from "next/link";
import { Logo } from "@/components/shared/Logo";
import { LanguageSwitch } from "@/components/shared/LanguageSwitch";
import { InstallPrompt } from "@/components/shared/InstallPrompt";
import { serverIsFrench } from "@/lib/i18n/server";
import { LiveOrderStrip } from "@/components/customer/LiveOrderStrip";

/**
 * Rendered only from server components, so the language comes from the cookie
 * rather than the client context — the label a screen reader announces has to
 * be in the visitor's language too.
 */
export async function CustomerHeader() {
  const fr = await serverIsFrench();
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-ink-700/50 glass">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2 px-4 py-3">
          <Link href="/" aria-label={fr ? "Accueil Urban Night Lift" : "Urban Night Lift home"}>
            <Logo height={34} />
          </Link>
          <div className="flex items-center gap-2">
            <InstallPrompt variant="app" className="px-2.5 py-1.5 text-xs" />
            <LanguageSwitch />
          </div>
        </div>
      </header>
      {/*
        Directly under the header, so a live order is part of the chrome on
        every screen that has a header rather than something each page has to
        remember to render. It draws nothing at all when there is no order,
        which is most of the time for most people.
      */}
      <LiveOrderStrip />
    </>
  );
}
