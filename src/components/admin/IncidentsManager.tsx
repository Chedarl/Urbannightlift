"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/shared/Button";
import { Badge } from "@/components/shared/Badge";
import type { IncidentType, IncidentResolutionStatus, ResponsibleParty } from "@prisma/client";

export interface IncidentItem {
  id: string;
  orderCode: string | null;
  incidentType: IncidentType;
  description: string;
  responsibleParty: ResponsibleParty;
  resolutionStatus: IncidentResolutionStatus;
  internalNotes: string | null;
  createdAt: string;
}

const inputCls =
  "w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-mist-100 focus:border-violet-500 focus:outline-none";
const TYPES: IncidentType[] = [
  "CUSTOMER_COMPLAINT",
  "RIDER_ISSUE",
  "MERCHANT_ISSUE",
  "PAYMENT_ISSUE",
  "DAMAGED_ITEM",
  "MISSING_ITEM",
  "LATE_DELIVERY",
  "SAFETY_CONCERN",
  "WRONG_ADDRESS",
  "CUSTOMER_UNREACHABLE",
];
const PARTIES: ResponsibleParty[] = ["RIDER", "CUSTOMER", "MERCHANT", "DISPATCH", "UNKNOWN"];
const RESOLUTIONS: IncidentResolutionStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "ESCALATED", "CLOSED"];

const resTone: Record<IncidentResolutionStatus, "caution" | "violet" | "safe" | "restricted" | "muted"> = {
  OPEN: "caution",
  IN_PROGRESS: "violet",
  RESOLVED: "safe",
  ESCALATED: "restricted",
  CLOSED: "muted",
};

export function IncidentsManager({ incidents }: { incidents: IncidentItem[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{
    orderCode: string;
    incidentType: IncidentType;
    description: string;
    responsibleParty: ResponsibleParty;
    internalNotes: string;
  }>({ orderCode: "", incidentType: "CUSTOMER_COMPLAINT", description: "", responsibleParty: "UNKNOWN", internalNotes: "" });

  async function create() {
    await fetch("/api/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, orderCode: form.orderCode || undefined }),
    });
    setCreating(false);
    setForm({ orderCode: "", incidentType: "CUSTOMER_COMPLAINT", description: "", responsibleParty: "UNKNOWN", internalNotes: "" });
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">{t("admin.incidents.title")}</h1>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus className="h-4 w-4" /> {t("admin.incidents.add")}
        </Button>
      </div>

      {creating && (
        <div className="grid gap-2 rounded-2xl border border-gold-400/30 bg-ink-900 p-4 sm:grid-cols-2">
          <input className={inputCls} placeholder={t("admin.incidents.orderCode")} value={form.orderCode} onChange={(e) => setForm({ ...form, orderCode: e.target.value })} />
          <select className={inputCls} value={form.incidentType} onChange={(e) => setForm({ ...form, incidentType: e.target.value as IncidentType })}>
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`admin.incidents.types.${ty}`)}
              </option>
            ))}
          </select>
          <select className={inputCls} value={form.responsibleParty} onChange={(e) => setForm({ ...form, responsibleParty: e.target.value as ResponsibleParty })}>
            {PARTIES.map((p) => (
              <option key={p} value={p}>
                {t(`admin.incidents.parties.${p}`)}
              </option>
            ))}
          </select>
          <textarea className={`${inputCls} sm:col-span-2`} rows={2} placeholder={t("admin.incidents.description")} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <textarea className={`${inputCls} sm:col-span-2`} rows={2} placeholder={t("admin.incidents.internalNotes")} value={form.internalNotes} onChange={(e) => setForm({ ...form, internalNotes: e.target.value })} />
          <Button size="sm" className="sm:col-span-2" onClick={create} disabled={pending || !form.description}>
            {t("common.save")}
          </Button>
        </div>
      )}

      {incidents.length === 0 ? (
        <p className="rounded-2xl border border-ink-700 bg-ink-900 p-8 text-center text-sm text-mist-500">
          {t("admin.incidents.empty")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {incidents.map((i) => (
            <div key={i.id} className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="violet">{t(`admin.incidents.types.${i.incidentType}`)}</Badge>
                <Badge tone={resTone[i.resolutionStatus]}>{t(`admin.incidents.resolutions.${i.resolutionStatus}`)}</Badge>
                {i.orderCode && <span className="text-xs font-medium text-gold-400">{i.orderCode}</span>}
                <span className="ml-auto text-xs text-mist-500">
                  {new Date(i.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="mt-2 text-sm">{i.description}</p>
              {i.internalNotes && <p className="mt-1 text-xs text-mist-500">{i.internalNotes}</p>}
              <p className="mt-1 text-xs text-mist-500">
                {t("admin.incidents.responsible")}: {t(`admin.incidents.parties.${i.responsibleParty}`)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
