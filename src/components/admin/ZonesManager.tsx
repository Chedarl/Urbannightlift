"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/shared/Button";
import { Badge } from "@/components/shared/Badge";
import { formatXaf } from "@/lib/utils";
import type { SafetyLevel } from "@prisma/client";

export interface ZoneItem {
  id: string;
  zoneName: string;
  description: string | null;
  feeXaf: number;
  nearbyFeeXaf: number | null;
  extendedFeeXaf: number | null;
  nightUrgencyFeeXaf: number;
  medicineFeeXaf: number;
  waitingFeeXaf: number;
  safetyLevel: SafetyLevel;
  active: boolean;
  notes: string | null;
}

const inputCls =
  "w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-mist-100 focus:border-violet-500 focus:outline-none";
const SAFETY: SafetyLevel[] = ["SAFE", "CAUTION", "RESTRICTED", "NO_GO"];
const safetyTone: Record<SafetyLevel, "safe" | "caution" | "restricted"> = {
  SAFE: "safe",
  CAUTION: "caution",
  RESTRICTED: "restricted",
  NO_GO: "restricted",
};

export function ZonesManager({ zones, isOwner }: { zones: ZoneItem[]; isOwner: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Record<string, ZoneItem>>({});
  const [creating, setCreating] = useState(false);
  const [newZone, setNewZone] = useState<Partial<ZoneItem>>({
    zoneName: "",
    feeXaf: 1000,
    safetyLevel: "SAFE",
    active: true,
  });

  function edit(z: ZoneItem, patch: Partial<ZoneItem>) {
    setEditing((prev) => ({ ...prev, [z.id]: { ...z, ...prev[z.id], ...patch } }));
  }

  async function save(id: string) {
    const data = editing[id];
    if (!data) return;
    await fetch(`/api/zones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setEditing((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    startTransition(() => router.refresh());
  }

  async function create() {
    await fetch("/api/zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newZone),
    });
    setCreating(false);
    setNewZone({ zoneName: "", feeXaf: 1000, safetyLevel: "SAFE", active: true });
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">{t("admin.zones.title")}</h1>
        {isOwner && (
          <Button size="sm" onClick={() => setCreating((v) => !v)}>
            <Plus className="h-4 w-4" /> {t("admin.zones.add")}
          </Button>
        )}
      </div>

      {!isOwner && <p className="text-sm text-caution">{t("admin.zones.ownerOnly")}</p>}

      {creating && isOwner && (
        <div className="grid gap-2 rounded-2xl border border-gold-400/30 bg-ink-900 p-4 sm:grid-cols-3">
          <input
            className={inputCls}
            placeholder={t("admin.zones.name")}
            value={newZone.zoneName ?? ""}
            onChange={(e) => setNewZone({ ...newZone, zoneName: e.target.value })}
          />
          <input
            className={inputCls}
            type="number"
            placeholder={t("admin.zones.fee")}
            value={newZone.feeXaf ?? 0}
            onChange={(e) => setNewZone({ ...newZone, feeXaf: Number(e.target.value) })}
          />
          <select
            className={inputCls}
            value={newZone.safetyLevel}
            onChange={(e) => setNewZone({ ...newZone, safetyLevel: e.target.value as SafetyLevel })}
          >
            {SAFETY.map((s) => (
              <option key={s} value={s}>
                {t(`admin.zones.safetyLevels.${s}`)}
              </option>
            ))}
          </select>
          <Button size="sm" className="sm:col-span-3" onClick={create} disabled={pending || !newZone.zoneName}>
            {t("common.save")}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {zones.map((z) => {
          const cur = editing[z.id] ?? z;
          const dirty = Boolean(editing[z.id]);
          return (
            <div key={z.id} className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-display font-semibold">{z.zoneName}</span>
                  <Badge tone={safetyTone[cur.safetyLevel]}>{t(`admin.zones.safetyLevels.${cur.safetyLevel}`)}</Badge>
                  {!z.active && <Badge tone="muted">inactive</Badge>}
                </div>
                <span className="text-sm font-medium text-gold-400">{formatXaf(z.feeXaf)}</span>
              </div>
              {isOwner && (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <label className="text-xs text-mist-500">
                    {t("admin.zones.fee")}
                    <input className={inputCls} type="number" value={cur.feeXaf} onChange={(e) => edit(z, { feeXaf: Number(e.target.value) })} />
                  </label>
                  <label className="text-xs text-mist-500">
                    {t("admin.zones.nearbyFee")}
                    <input className={inputCls} type="number" value={cur.nearbyFeeXaf ?? 0} onChange={(e) => edit(z, { nearbyFeeXaf: Number(e.target.value) })} />
                  </label>
                  <label className="text-xs text-mist-500">
                    {t("admin.zones.medicineFee")}
                    <input className={inputCls} type="number" value={cur.medicineFeeXaf} onChange={(e) => edit(z, { medicineFeeXaf: Number(e.target.value) })} />
                  </label>
                  <label className="text-xs text-mist-500">
                    {t("admin.zones.urgencyFee")}
                    <input className={inputCls} type="number" value={cur.nightUrgencyFeeXaf} onChange={(e) => edit(z, { nightUrgencyFeeXaf: Number(e.target.value) })} />
                  </label>
                  <label className="text-xs text-mist-500">
                    {t("admin.zones.safety")}
                    <select className={inputCls} value={cur.safetyLevel} onChange={(e) => edit(z, { safetyLevel: e.target.value as SafetyLevel })}>
                      {SAFETY.map((s) => (
                        <option key={s} value={s}>
                          {t(`admin.zones.safetyLevels.${s}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-mist-500">
                    {t("admin.zones.active")}
                    <select className={inputCls} value={String(cur.active)} onChange={(e) => edit(z, { active: e.target.value === "true" })}>
                      <option value="true">{t("common.yes")}</option>
                      <option value="false">{t("common.no")}</option>
                    </select>
                  </label>
                  {dirty && (
                    <Button size="sm" className="sm:col-span-3" onClick={() => save(z.id)} disabled={pending}>
                      <Save className="h-4 w-4" /> {t("common.save")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
