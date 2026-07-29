"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, BellRing } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { OperatingModeControls } from "@/components/admin/OperatingModeControls";
import { Button } from "@/components/shared/Button";
import type { OperatingMode, ServiceType } from "@prisma/client";

/** 0–23, labelled so nobody has to translate 18 into 6 PM in their head. */
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function hourLabel(h: number): string {
  const hour = ((h % 24) + 24) % 24;
  const suffix = hour < 12 ? "AM" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:00 ${suffix}`;
}

/** How many hours the window spans, handling the wrap past midnight. */
function nightLength(start: number, end: number): number {
  return start <= end ? end - start : 24 - start + end;
}

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
    testMode: boolean;
    voiceOrderingEnabled: boolean;
    googleSiteVerification: string;
    notificationEmail: string;
    emailOnEveryOrder: boolean;
    dailySummaryEmail: boolean;
  };
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [form, setForm] = useState(settings);

  const openHoursLength = nightLength(form.operatingStartHour, form.operatingEndHour);
  // A night service open more than half the day almost always means an AM/PM
  // mix-up, which is exactly the mistake the old number field allowed.
  const openHoursSuspicious = openHoursLength > 12;

  async function save() {
    setSaved(false);
    setSaveError(null);
    const res = await fetch("/api/settings", {
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
        testMode: form.testMode,
        voiceOrderingEnabled: form.voiceOrderingEnabled,
        googleSiteVerification: form.googleSiteVerification,
        notificationEmail: form.notificationEmail,
        emailOnEveryOrder: form.emailOnEveryOrder,
        dailySummaryEmail: form.dailySummaryEmail,
      }),
    });

    // This used to say "Saved" no matter what came back. A rejected change —
    // most often a privileged field a non-owner may not touch — looked exactly
    // like a successful one, so a setting could be toggled, confirmed, and
    // silently not change. Nothing is claimed now unless the server agreed.
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setSaveError(
        data.error ??
          (res.status === 401
            ? "Your session has expired. Sign in again."
            : "That didn't save. Nothing was changed.")
      );
      // Put the form back to what the server actually holds.
      startTransition(() => router.refresh());
      return;
    }

    setSaved(true);
    startTransition(() => router.refresh());
  }

  /** Proves the whole path works without waiting for a real order at 1 AM. */
  async function sendTestEmail() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/test-email", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      setTestResult(
        res.ok
          ? { ok: true, message: `Sent to ${d.to}. If it doesn't arrive in a minute, check spam.` }
          : { ok: false, message: d.error ?? "That didn't send." }
      );
    } catch {
      setTestResult({ ok: false, message: "That didn't send." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <h1 className="font-display text-2xl font-bold">{t("admin.settings.title")}</h1>

      <section className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
        <h2 className="mb-3 font-display text-sm font-semibold text-gold-300">{t("admin.settings.mode")}</h2>
        <OperatingModeControls mode={settings.mode} />
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-4">
        {/* Named hours, not bare numbers. These are 24-hour values, so a plain
            number field silently accepts "6" from someone who means 6 PM — and
            that single character moves the whole operating night, the open/closed
            badge and what counts as tonight on the dashboard. */}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-mist-500">
            {t("admin.settings.startHour")}
            <select
              className={inputCls}
              value={form.operatingStartHour}
              onChange={(e) => setForm({ ...form, operatingStartHour: Number(e.target.value) })}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-mist-500">
            {t("admin.settings.endHour")}
            <select
              className={inputCls}
              value={form.operatingEndHour}
              onChange={(e) => setForm({ ...form, operatingEndHour: Number(e.target.value) })}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className={openHoursSuspicious ? "text-xs text-gold-200" : "text-xs text-mist-400"}>
          We take orders from <strong>{hourLabel(form.operatingStartHour)}</strong> to{" "}
          <strong>{hourLabel(form.operatingEndHour)}</strong> ({openHoursLength} hours a night).
          {openHoursSuspicious && " That is unusually long for a night service — check you picked PM, not AM."}
        </p>
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

        {/* Test mode. Deliberately loud when on: an operation that quietly
            stays in test mode after launch reports no revenue at all. */}
        <div
          className={
            form.testMode
              ? "rounded-xl border border-gold-400/60 bg-gold-400/10 p-3"
              : "rounded-xl border border-ink-700 bg-ink-950 p-3"
          }
        >
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-violet-500"
              checked={form.testMode}
              onChange={(e) => setForm({ ...form, testMode: e.target.checked })}
            />
            <span>
              <span className="block text-sm font-semibold text-mist-100">Test mode</span>
              <span className="block text-xs text-mist-400">
                Every new order is flagged as a test and kept out of revenue, counts and exports. Use it to rehearse
                the whole operation before launch, then switch it off on launch night.
              </span>
              {form.testMode && (
                <span className="mt-1 block text-xs font-semibold text-gold-200">
                  On — orders placed right now do not count as real trading.
                </span>
              )}
            </span>
          </label>
        </div>

        {/* Voice ordering. Built and tested, held back on purpose until the
            owner sees demand for it — turning it on needs no deploy. */}
        <div className="rounded-xl border border-ink-700 bg-ink-950 p-3">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-violet-500"
              checked={form.voiceOrderingEnabled}
              onChange={(e) => setForm({ ...form, voiceOrderingEnabled: e.target.checked })}
            />
            <span>
              <span className="block text-sm font-semibold text-mist-100">Voice-note ordering</span>
              <span className="block text-xs text-mist-400">
                Lets a customer record what they need instead of filling in the form, and puts the
                recording on the order for dispatch to play. Off by default — switch it on when you
                want to try it, off again if it isn&apos;t landing. Notes are private to staff.
              </span>
              {form.voiceOrderingEnabled && (
                <span className="mt-1 block text-xs font-semibold text-gold-200">
                  On — customers see the microphone on the order form.
                </span>
              )}
            </span>
          </label>
        </div>

        {/* Operational email. Where the business finds out things happened. */}
        <div className="rounded-xl border border-ink-700 bg-ink-950 p-3">
          <p className="mb-1 text-sm font-semibold text-mist-100">Email notifications</p>
          <label className="text-xs text-mist-500">
            Send operational email to
            <input
              className={inputCls}
              type="email"
              value={form.notificationEmail}
              onChange={(e) => setForm({ ...form, notificationEmail: e.target.value })}
              placeholder="urbannighlift@gmail.com"
            />
          </label>
          <label className="mt-3 flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-violet-500"
              checked={form.emailOnEveryOrder}
              onChange={(e) => setForm({ ...form, emailOnEveryOrder: e.target.checked })}
            />
            <span>
              <span className="block text-sm text-mist-100">An email for every order</span>
              <span className="block text-xs text-mist-400">
                Right for now, while every order counts. At thirty a night an inbox like this stops
                being read — switch it off then and keep the nightly summary.
              </span>
            </span>
          </label>
          <label className="mt-3 flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-violet-500"
              checked={form.dailySummaryEmail}
              onChange={(e) => setForm({ ...form, dailySummaryEmail: e.target.checked })}
            />
            <span>
              <span className="block text-sm text-mist-100">Nightly summary at 4:30 AM</span>
              <span className="block text-xs text-mist-400">
                What came in, what was earned, what is still waiting on you. This is the one worth
                keeping.
              </span>
            </span>
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={sendTestEmail} disabled={testing}>
              {testing ? "Sending…" : "Send me a test email"}
            </Button>
            <span className="text-[11px] text-mist-500">Save first if you just changed the address.</span>
          </div>
          {testResult && (
            <p
              className={
                testResult.ok
                  ? "mt-2 rounded-lg border border-safe/40 bg-safe/10 px-3 py-2 text-xs text-safe"
                  : "mt-2 rounded-lg border border-restricted/40 bg-restricted/10 px-3 py-2 text-xs text-restricted"
              }
            >
              {testResult.message}
            </p>
          )}

          <p className="mt-2 text-[11px] text-mist-500">
            Applications and signups always send an email — those need a decision. Documents people
            upload are linked, never attached, so nobody&apos;s ID card sits in an inbox.
          </p>
        </div>

        {/* Search Console ownership. Here rather than an environment variable
            because a variable only applies to the next build, so setting one
            and pressing Verify fails for a reason nothing on screen explains. */}
        <div className="rounded-xl border border-ink-700 bg-ink-950 p-3">
          <p className="mb-1 text-sm font-semibold text-mist-100">Google site verification</p>
          <p className="mb-2 text-xs text-mist-400">
            In Search Console choose <strong>HTML tag</strong> and paste it here — the whole tag is
            fine, we take the token out. It goes live on the next page load, no redeploy. This is
            what lets us ask Google to review a security warning.
          </p>
          <input
            className={inputCls}
            value={form.googleSiteVerification}
            onChange={(e) => setForm({ ...form, googleSiteVerification: e.target.value })}
            placeholder='<meta name="google-site-verification" content="..." />'
          />
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

        {saveError && (
          <p className="mt-3 rounded-xl border border-restricted/40 bg-restricted/10 px-3 py-2 text-sm text-restricted">
            {saveError}
          </p>
        )}
      </section>
    </div>
  );
}
