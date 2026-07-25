"use client";

import Link from "next/link";
import { MessageCircle, LogOut } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { Logo } from "@/components/shared/Logo";
import { LanguageSwitch } from "@/components/shared/LanguageSwitch";
import { InstallPrompt } from "@/components/shared/InstallPrompt";
import { EnableNotifications } from "@/components/shared/EnableNotifications";
import { signOutAction } from "@/lib/auth/actions";
import { buildWaLink, ADMIN_WHATSAPP_NUMBER } from "@/lib/whatsapp/links";

export function RiderShell({ userName, children }: { userName: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-ink-700/60 bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2 px-4 py-3">
          <Link href="/rider/dashboard">
            <Logo compact />
          </Link>
          <span className="truncate text-sm font-medium text-mist-300">{userName}</span>
          <div className="flex items-center gap-2">
            <LanguageSwitch />
            <a
              href={buildWaLink(ADMIN_WHATSAPP_NUMBER, "Rider needs help")}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#25D366] text-ink-950"
              aria-label={t("rider.dashboard.emergency")}
            >
              <MessageCircle className="h-4 w-4" />
            </a>
            <form action={signOutAction}>
              <button type="submit" className="flex h-8 w-8 items-center justify-center rounded-lg text-mist-500 hover:bg-ink-800" aria-label={t("common.logout")}>
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-6">
        <InstallPrompt variant="rider" className="mb-4 w-full" />
        {/* Without this a rider only learns about a job by opening the app. */}
        <EnableNotifications className="mb-4" />
        {children}
      </main>
    </div>
  );
}
