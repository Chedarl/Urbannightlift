"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Clock, BellRing, Loader2, Check } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { getExperience } from "@/lib/services/experiences";
import type { ServiceType } from "@prisma/client";

const inputCls =
  "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-violet-500 focus:outline-none";

/**
 * Full-page state for /order/new?service=X when that service is paused. Reached
 * by deep links, shared URLs and the installed app, so it must stand on its own
 * rather than assume the customer came from the service grid.
 */
export function ServiceComingSoon({ serviceType }: { serviceType: ServiceType }) {
  const { t, locale } = useTranslation();
  const fr = locale === "fr";
  const exp = getExperience(serviceType);
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
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
      if (!res.ok) {
        setError(t("comingSoon.error"));
        setState("idle");
        return;
      }
      setState("done");
    } catch {
      setError(t("comingSoon.error"));
      setState("idle");
    }
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 px-4 pb-16 pt-4">
      <Link href="/order" className="inline-flex items-center gap-1.5 text-sm text-mist-400 hover:text-mist-200">
        <ArrowLeft className="h-4 w-4" /> {t("common.back")}
      </Link>

      <div className="rounded-2xl border border-ink-700 bg-ink-900 p-6 text-center">
        <span
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${exp.accent}1f`, color: exp.accent }}
        >
          <Clock className="h-7 w-7" />
        </span>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wider" style={{ color: exp.accent }}>
          {t("comingSoon.badge")}
        </p>
        <h1 className="mt-1 font-display text-xl font-bold text-mist-100">{t(exp.titleKey)}</h1>
        <p className="mt-2 text-sm leading-relaxed text-mist-400">{t("comingSoon.body")}</p>

        {state === "done" ? (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-safe/10 p-3 text-left text-sm leading-relaxed text-safe">
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
            {t("comingSoon.success")}
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-2 text-left">
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
              style={{ backgroundColor: exp.accent }}
            >
              {state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
              {t("comingSoon.notifyCta")}
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-ink-700 bg-ink-900/50 p-4 text-center">
        <p className="text-xs text-mist-400">{t("comingSoon.meanwhile")}</p>
        <Link
          href="/order"
          className="mt-2 inline-flex items-center justify-center rounded-xl bg-gold-400 px-5 py-2.5 text-sm font-semibold text-ink-950 hover:bg-gold-300"
        >
          {fr ? "Voir les services disponibles" : "See available services"}
        </Link>
      </div>
    </div>
  );
}
