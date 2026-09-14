"use client";

import { useEffect, useState } from "react";
import { Download, Share, MoreVertical, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { isStandalone } from "@/lib/native/bridge";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Platform = "ios" | "android" | "desktop";

/**
 * "Install app" button.
 *
 * Uses the native install flow when the browser offers it (`beforeinstallprompt`,
 * Chrome/Edge/Samsung on Android and desktop). That event is not guaranteed —
 * iOS Safari has no programmatic install at all, and other browsers may never
 * fire it — so the button ALWAYS renders and falls back to short, per-platform
 * "add to home screen" instructions. It hides only when the app is already
 * running installed.
 */
export function InstallPrompt({
  variant = "app",
  className,
}: {
  variant?: "app" | "rider";
  className?: string;
}) {
  const { t, locale } = useTranslation();
  const fr = locale === "fr";
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [installed, setInstalled] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  // Until mounted we don't know the platform or install state — render nothing
  // rather than flashing a button that may be wrong.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Covers the installed PWA and the native shell alike. Telling somebody who
    // downloaded the app from the Play Store to add the app to their home screen
    // is the kind of small wrongness that makes a product feel unattended.
    if (isStandalone()) setInstalled(true);

    const ua = window.navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document)) {
      setPlatform("ios");
    } else if (/android/i.test(ua)) {
      setPlatform("android");
    } else {
      setPlatform("desktop");
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setShowSheet(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!mounted || installed) return null;

  const label = variant === "rider" ? t("install.rider") : t("install.app");

  async function onClick() {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice.catch(() => ({ outcome: "dismissed" as const }));
      if (choice.outcome === "accepted") setInstalled(true);
      setDeferred(null);
      return;
    }
    // No native prompt available — show how to do it by hand.
    setShowSheet(true);
  }

  const steps: { icon: React.ReactNode; text: string }[] =
    platform === "ios"
      ? [
          {
            icon: <Share className="h-4 w-4" />,
            text: fr
              ? "Appuyez sur l'icône Partager en bas de Safari."
              : "Tap the Share icon at the bottom of Safari.",
          },
          {
            icon: <Download className="h-4 w-4" />,
            text: fr
              ? "Choisissez « Sur l'écran d'accueil », puis Ajouter."
              : 'Choose "Add to Home Screen", then Add.',
          },
        ]
      : [
          {
            icon: <MoreVertical className="h-4 w-4" />,
            text: fr
              ? "Ouvrez le menu ⋮ de votre navigateur."
              : "Open your browser's ⋮ menu.",
          },
          {
            icon: <Download className="h-4 w-4" />,
            text: fr
              ? "Choisissez « Installer l'application » ou « Ajouter à l'écran d'accueil »."
              : 'Choose "Install app" or "Add to Home screen".',
          },
        ];

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

      {showSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          onClick={() => setShowSheet(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <h3 className="font-display text-base font-semibold text-mist-100">
                {t("install.iosTitle")}
              </h3>
              <button
                type="button"
                onClick={() => setShowSheet(false)}
                aria-label={t("common.close")}
                className="text-mist-500 hover:text-mist-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <ol className="flex flex-col gap-3">
              {steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-600/20 text-violet-300">
                    {s.icon}
                  </span>
                  <span className="pt-1 text-sm leading-relaxed text-mist-300">{s.text}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs leading-relaxed text-mist-500">
              {fr
                ? "L'application s'ouvrira comme une vraie app, en plein écran."
                : "The app then opens full-screen, just like a native app."}
            </p>
            <button
              type="button"
              onClick={() => setShowSheet(false)}
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
