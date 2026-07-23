"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { OperatingModeControls } from "@/components/admin/OperatingModeControls";
import { Button } from "@/components/shared/Button";
import type { OperatingMode } from "@prisma/client";

const inputCls =
  "w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-mist-100 focus:border-violet-500 focus:outline-none";

export function SettingsManager({
  settings,
}: {
  settings: {
    mode: OperatingMode;
    operatingStartHour: number;
    operatingEndHour: number;
    zoneNoticeEn: string;
    zoneNoticeFr: string;
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
