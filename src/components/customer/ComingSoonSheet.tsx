"use client";

import { useState } from "react";
import { Clock, X, Check, Loader2, BellRing } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import type { ServiceType } from "@prisma/client";

const inputCls =
  "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-violet-500 focus:outline-none";

/**
 * Shown when a customer taps a service that isn't live yet. Collecting the
 * WhatsApp number turns the wait into the demand signal the owner uses to decide
 * which service to launch next.
 */
export function ComingSoonSheet({
  serviceType,
  serviceName,
  accent,
  onClose,
}: {
  serviceType: ServiceType;
  serviceName: string;
  accent: string;
  onClose: () => void;
}) {
  const { t, locale } = useTranslation();
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "live">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/service-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceType, whatsappNumber: phone, locale }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(t("comingSoon.error"));
        setState("idle");
        return;
      }
      setState(data.alreadyLive ? "live" : "done");
    } catch {
      setError(t("comingSoon.error"));
      setState("idle");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${accent}22`, color: accent }}
            >
              <Clock className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-mist-100">{serviceName}</p>
              <p className="text-[11px] font-medium" style={{ color: accent }}>
                {t("comingSoon.badge")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("comingSoon.close")}
            className="text-mist-500 hover:text-mist-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {state === "done" ? (
          <p className="flex items-start gap-2 rounded-xl bg-safe/10 p-3 text-sm leading-relaxed text-safe">
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
            {t("comingSoon.success")}
          </p>
        ) : state === "live" ? (
          <p className="rounded-xl bg-safe/10 p-3 text-sm leading-relaxed text-safe">
            {t("comingSoon.nowLive")}
          </p>
        ) : (
          <>
            <h3 className="font-display text-base font-semibold text-mist-100">
              {t("comingSoon.title")}
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-mist-400">{t("comingSoon.body")}</p>

            <div className="mt-4 flex flex-col gap-2">
              <input
                className={inputCls}
                inputMode="tel"
                autoComplete="tel"
                placeholder={t("comingSoon.placeholder")}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              {error && <p className="text-xs text-restricted">{error}</p>}
              <button
                type="button"
                disabled={state === "sending" || phone.trim().length < 8}
                onClick={submit}
                className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-950 transition-opacity disabled:opacity-50"
                style={{ backgroundColor: accent }}
              >
                {state === "sending" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <BellRing className="h-4 w-4" />
                )}
                {t("comingSoon.notifyCta")}
              </button>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-xl border border-ink-600 px-4 py-2 text-xs font-medium text-mist-300 hover:text-mist-100"
        >
          {t("comingSoon.close")}
        </button>
      </div>
    </div>
  );
}
