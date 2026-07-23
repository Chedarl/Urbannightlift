"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/shared/Button";
import { Badge } from "@/components/shared/Badge";
import type { MerchantCategory } from "@prisma/client";

export interface MerchantItem {
  id: string;
  merchantName: string;
  category: MerchantCategory;
  whatsappNumber: string;
  phone: string | null;
  address: string;
  landmark: string | null;
  openingHours: string | null;
  notes: string | null;
  verified: boolean;
  active: boolean;
}

const inputCls =
  "w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-mist-100 focus:border-violet-500 focus:outline-none";
const CATEGORIES: MerchantCategory[] = ["FOOD", "PHARMACY", "GROCERY", "GENERAL_STORE", "OTHER"];

const empty: Partial<MerchantItem> = { category: "FOOD", verified: true, active: true };

export function MerchantsManager({ merchants }: { merchants: MerchantItem[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Partial<MerchantItem>>(empty);

  async function create() {
    await fetch("/api/merchants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setCreating(false);
    setForm(empty);
    startTransition(() => router.refresh());
  }

  async function toggle(id: string, patch: Partial<MerchantItem>) {
    await fetch(`/api/merchants/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">{t("admin.merchants.title")}</h1>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus className="h-4 w-4" /> {t("admin.merchants.add")}
        </Button>
      </div>

      {creating && (
        <div className="grid gap-2 rounded-2xl border border-gold-400/30 bg-ink-900 p-4 sm:grid-cols-2">
          <input className={inputCls} placeholder={t("admin.merchants.name")} value={form.merchantName ?? ""} onChange={(e) => setForm({ ...form, merchantName: e.target.value })} />
          <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as MerchantCategory })}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`admin.merchants.categories.${c}`)}
              </option>
            ))}
          </select>
          <input className={inputCls} placeholder={t("admin.merchants.whatsapp")} value={form.whatsappNumber ?? ""} onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })} />
          <input className={inputCls} placeholder={t("admin.merchants.phone")} value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input className={inputCls} placeholder={t("admin.merchants.address")} value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <input className={inputCls} placeholder={t("admin.merchants.landmark")} value={form.landmark ?? ""} onChange={(e) => setForm({ ...form, landmark: e.target.value })} />
          <input className={inputCls} placeholder={t("admin.merchants.hours")} value={form.openingHours ?? ""} onChange={(e) => setForm({ ...form, openingHours: e.target.value })} />
          <input className={inputCls} placeholder={t("admin.merchants.notes")} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <Button size="sm" className="sm:col-span-2" onClick={create} disabled={pending || !form.merchantName || !form.whatsappNumber || !form.address}>
            {t("common.save")}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {merchants.map((m) => (
          <div key={m.id} className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-display font-semibold">{m.merchantName}</span>
                <Badge tone="violet">{t(`admin.merchants.categories.${m.category}`)}</Badge>
                {m.verified && <Badge tone="gold"><Check className="h-3 w-3" /> {t("admin.merchants.verified")}</Badge>}
                {!m.active && <Badge tone="muted">inactive</Badge>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => toggle(m.id, { verified: !m.verified })} disabled={pending}>
                  {m.verified ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />} {t("admin.merchants.verified")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => toggle(m.id, { active: !m.active })} disabled={pending}>
                  {m.active ? t("admin.users.suspend") : t("admin.users.reactivate")}
                </Button>
              </div>
            </div>
            <p className="mt-1 text-xs text-mist-500">
              {m.address}
              {m.landmark ? ` · ${m.landmark}` : ""} · {m.whatsappNumber}
              {m.openingHours ? ` · ${m.openingHours}` : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
