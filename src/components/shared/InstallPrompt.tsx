"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Reusable "Install app" button. On Chrome/Android it captures the browser's
 * `beforeinstallprompt` event and triggers the native install. On iOS Safari
 * (which has no programmatic install) it opens short "Add to Home Screen"
 * instructions. Hides itself when the app is already installed/standalone.
 */
export function InstallPrompt({
  variant = "app",
  className,
}: {
  variant?: "app" | "rider";
  className?: string;
}) {
  const { t } = useTranslation();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [showIosSheet, setShowIosSheet] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Already running as an installed PWA — nothing to offer.
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari exposes navigator.standalone
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) {
      setHidden(true);
      return;
    }

    const ua = window.navigator.userAgent;
    const iOS = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
    setIsIos(iOS && isSafari);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setHidden(true);

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Nothing to show: installed, or a browser that neither fired the event nor is iOS Safari.
  if (hidden || (!deferred && !isIos)) return null;

  const label = variant === "rider" ? t("install.rider") : t("install.app");

  async function onClick() {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice.catch(() => ({ outcome: "dismissed" as const }));
      if (choice.outcome === "accepted") setHidden(true);
      setDeferred(null);
      return;
    }
    if (isIos) setShowIosSheet(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-mist-100 transition-colors hover:bg-violet-500",
          className
        )}
      >
        <Download className="h-4 w-4" /> {label}
      </button>

      {showIosSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4"
          onClick={() => setShowIosSheet(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-mist-100">
                {t("install.iosTitle")}
              </h3>
              <button
                type="button"
                onClick={() => setShowIosSheet(false)}
                aria-label={t("common.close")}
                className="text-mist-500 hover:text-mist-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="flex items-start gap-2 text-sm leading-relaxed text-mist-300">
              <Share className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
              <span>{t("install.iosSteps")}</span>
            </p>
            <button
              type="button"
              onClick={() => setShowIosSheet(false)}
              className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-mist-100"
            >
              {t("install.gotIt")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
