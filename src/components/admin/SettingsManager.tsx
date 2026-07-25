"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, BellRing } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { OperatingModeControls } from "@/components/admin/OperatingModeControls";
import { Button } from "@/components/shared/Button";
import type { OperatingMode, ServiceType } from "@prisma/client";

const inputCls =
  "w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-mist-100 focus:border-violet-500 focus:outline-none";

const SERVICE_ORDER: ServiceType[] = [
  "MEDICINE_PICKUP",
  "FOOD_PICKUP",
  "GROCERY_PICKUP",
  "SMALL_PARCEL",
  "URGENT_ITEM",
  "CUSTOM_ERRAND",
  "MERCHANT_DELIVERY",
];

export function SettingsManager({
  settings,
  interestCounts,
}: {
  interestCounts: Partial<Record<ServiceType, number>>;
  settings: {
    mode: OperatingMode;
    enabledServices: ServiceType[];
    operatingStartHour: number;
    operatingEndHour: number;
    zoneNoticeEn: string;
    zoneNoticeFr: string;
    mtnMerchantCode: string;
    mtnUssdTemplate: string;
    orangeMerchantCode: string;
    orangeUssdTemplate: string;
    riderSharePercent: number;
  };
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState(settings);

  async function save() {
    setSaved(false);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operatingStartHour: form.operatingStartHour,
        operatingEndHour: form.operatingEndHour,
        zoneNoticeEn: form.zoneNoticeEn,
        zoneNoticeFr: form.zoneNoticeFr,
        mtnMerchantCode: form.mtnMerchantCode,
        mtnUssdTemplate: form.mtnUssdTemplate,
        orangeMerchantCode: form.orangeMerchantCode,
        orangeUssdTemplate: form.orangeUssdTemplate,
        enabledServices: form.enabledServices,
        riderSharePercent: form.riderSharePercent,
      }),
    });
    setSaved(true);
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <h1 className="font-display text-2xl font-bold">{t("admin.settings.title")}</h1>

      <section className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
        <h2 className="mb-3 font-display text-sm font-semibold text-gold-300">{t("admin.settings.mode")}</h2>
        <OperatingModeControls mode={settings.mode} />
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-mist-500">
            {t("admin.settings.startHour")}
            <input className={inputCls} type="number" min={0} max={23} value={form.operatingStartHour} onChange={(e) => setForm({ ...form, operatingStartHour: Number(e.target.value) })} />
          </label>
          <label className="text-xs text-mist-500">
            {t("admin.settings.endHour")}
            <input className={inputCls} type="number" min={1} max={24} value={form.operatingEndHour} onChange={(e) => setForm({ ...form, operatingEndHour: Number(e.target.value) })} />
          </label>
        </div>
        <label className="text-xs text-mist-500">
          {t("admin.settings.noticeEn")}
          <input className={inputCls} value={form.zoneNoticeEn} onChange={(e) => setForm({ ...form, zoneNoticeEn: e.target.value })} />
        </label>
        <label className="text-xs text-mist-500">
          {t("admin.settings.noticeFr")}
          <input className={inputCls} value={form.zoneNoticeFr} onChange={(e) => setForm({ ...form, zoneNoticeFr: e.target.value })} />
        </label>

        <div className="mt-2 border-t border-ink-700 pt-3">
          <p className="font-display text-sm font-semibold text-gold-300">Services offered</p>
          <p className="mb-2 text-xs text-mist-500">
            Switch a service on when demand justifies it. Anything off shows customers a
            &ldquo;coming soon&rdquo; card that collects WhatsApp numbers, and is refused server-side.
          </p>
          <div className="flex flex-col gap-1.5">
            {SERVICE_ORDER.map((svc) => {
              const on = form.enabledServices.includes(svc);
              const waiting = interestCounts[svc] ?? 0;
              return (
                <label
                  key={svc}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-800/60 px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-mist-100">{t(`services.${svc}.name`)}</span>
                    {waiting > 0 && (
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-gold-300">
                        <BellRing className="h-3 w-3" /> {waiting} waiting
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={on ? "text-xs font-semibold text-safe" : "text-xs text-mist-500"}>
                      {on ? "Live" : "On hold"}
                    </span>
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      style={{ accentColor: "#2fae60" }}
                      checked={on}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          enabledServices: e.target.checked
                            ? [...form.enabledServices, svc]
                            : form.enabledServices.filter((x) => x !== svc),
                        })
                      }
                    />
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="mt-2 border-t border-ink-700 pt-3">
          <p className="mb-2 font-display text-sm font-semibold text-gold-300">Mobile Money merchant</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-mist-500">
              MTN merchant code
              <input className={inputCls} value={form.mtnMerchantCode} onChange={(e) => setForm({ ...form, mtnMerchantCode: e.target.value })} placeholder="653077160" />
            </label>
            <label className="text-xs text-mist-500">
              MTN USSD template ({"{amount}"})
              <input className={inputCls} value={form.mtnUssdTemplate} onChange={(e) => setForm({ ...form, mtnUssdTemplate: e.target.value })} placeholder="*126*4*857539*{amount}#" />
            </label>
            <label className="text-xs text-mist-500">
              Orange merchant code
              <input className={inputCls} value={form.orangeMerchantCode} onChange={(e) => setForm({ ...form, orangeMerchantCode: e.target.value })} />
            </label>
            <label className="text-xs text-mist-500">
              Orange USSD template ({"{amount}"})
              <input className={inputCls} value={form.orangeUssdTemplate} onChange={(e) => setForm({ ...form, orangeUssdTemplate: e.target.value })} placeholder="#150*..." />
            </label>
          </div>
        </div>

        {/* The revenue share. Changing it applies to future deliveries only —
            an order already delivered keeps the terms it was completed under,
            so past accounts and past rider statements never move. */}
        <div className="rounded-xl border border-ink-700 bg-ink-950 p-3">
          <p className="mb-2 text-sm font-semibold text-mist-100">Revenue share</p>
          <label className="text-xs text-mist-500">
            Rider&apos;s share of each delivery fee (%)
            <input
              className={inputCls}
              type="number"
              min={0}
              max={100}
              value={form.riderSharePercent}
              onChange={(e) => setForm({ ...form, riderSharePercent: Number(e.target.value) })}
            />
          </label>
          <p className="mt-2 text-xs text-mist-400">
            Rider keeps {form.riderSharePercent}% · Urban Night Lift keeps {100 - form.riderSharePercent}%. On a 2,000
            XAF delivery that is {Math.ceil((2000 * form.riderSharePercent) / 100).toLocaleString("fr-FR")} XAF to the
            rider and {(2000 - Math.ceil((2000 * form.riderSharePercent) / 100)).toLocaleString("fr-FR")} XAF to you.
          </p>
          <p className="mt-1 text-[11px] text-mist-500">
            Applies to deliveries completed from now on. Rounding favours the rider.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button size="sm" onClick={save} disabled={pending}>
            <Save className="h-4 w-4" /> {t("common.save")}
          </Button>
          {saved && <span className="text-sm text-safe">{t("admin.settings.saved")}</span>}
        </div>
      </section>
    </div>
  );
}
