"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { PageHeader, SectionLabel } from "@/components/shared/portalKit";
import { Button } from "@/components/shared/Button";
import type { MerchantCategory } from "@prisma/client";

interface ShopFields {
  merchantName: string;
  category: MerchantCategory;
  address: string | null;
  landmark: string | null;
  phone: string | null;
  whatsappNumber: string;
  openingHours: string | null;
  nightOpen: boolean;
  open24h: boolean;
  website: string | null;
  socialUrl: string | null;
  logoUrl: string | null;
}

/**
 * The details a shop knows better than we do.
 *
 * Note what is *not* editable here: the business name, the category, and the
 * WhatsApp number the account is keyed on. Those are what a human verified when
 * we called them, and letting a merchant rewrite their own name after
 * verification would make the check meaningless. Changing one is a phone call
 * to dispatch, which is the right amount of friction for it.
 */
export function MerchantProfile({ merchant }: { merchant: ShopFields }) {
  const router = useRouter();
  const { locale } = useTranslation();
  const fr = locale === "fr";

  const [form, setForm] = useState({
    address: merchant.address,
    landmark: merchant.landmark ?? "",
    phone: merchant.phone ?? "",
    openingHours: merchant.openingHours ?? "",
    nightOpen: merchant.nightOpen,
    open24h: merchant.open24h,
    website: merchant.website ?? "",
    socialUrl: merchant.socialUrl ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/merchant-account/shop", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : fr ? "Réessayez." : "Try again.");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-mist-100 focus:border-violet-500 focus:outline-none";
  const label = "text-xs font-medium text-mist-400";

  return (
    <div>
      <PageHeader
        title={fr ? "Votre boutique" : "Your shop"}
        subtitle={merchant.merchantName}
        back="/merchant"
      />

      <SectionLabel>{fr ? "Où vous trouver" : "Finding you"}</SectionLabel>
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-4">
        <label className={label}>
          {fr ? "Adresse" : "Address"}
          <input
            className={`${input} mt-1.5`}
            value={form.address ?? ""}
            placeholder={fr ? "Facultatif" : "Optional"}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </label>
        <label className={label}>
          {fr ? "Point de repère" : "Landmark"}
          <input
            className={`${input} mt-1.5`}
            placeholder={fr ? "ex. derrière la station Total" : "e.g. behind the Total station"}
            value={form.landmark}
            onChange={(e) => setForm({ ...form, landmark: e.target.value })}
          />
        </label>
        <p className="text-[11px] leading-relaxed text-mist-500">
          {fr
            ? "C'est ce que lit le livreur à 1 h du matin. Un bon repère vaut mieux qu'une adresse exacte."
            : "This is what a rider reads at 1 AM. A good landmark beats an exact address."}
        </p>
      </div>

      <SectionLabel>{fr ? "Quand vous êtes ouvert" : "When you're open"}</SectionLabel>
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-4">
        <label className={label}>
          {fr ? "Horaires" : "Opening hours"}
          <input
            className={`${input} mt-1.5`}
            placeholder={fr ? "ex. 18h – 2h" : "e.g. 6 PM – 2 AM"}
            value={form.openingHours}
            onChange={(e) => setForm({ ...form, openingHours: e.target.value })}
          />
        </label>
        {/* The only availability that matters to a night-only service. */}
        <Toggle
          on={form.nightOpen}
          onChange={(v) => setForm({ ...form, nightOpen: v })}
          title={fr ? "Ouvert la nuit" : "Open at night"}
          hint={
            fr
              ? "Nous ne livrons qu'entre 18 h et 4 h. C'est le seul créneau qui compte ici."
              : "We only deliver between 6 PM and 4 AM. That's the only window that matters here."
          }
        />
        <Toggle
          on={form.open24h}
          onChange={(v) => setForm({ ...form, open24h: v })}
          title={fr ? "Ouvert 24 h/24" : "Open 24 hours"}
        />
      </div>

      <SectionLabel>{fr ? "Vous joindre" : "Reaching you"}</SectionLabel>
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-4">
        <label className={label}>
          {fr ? "Autre numéro" : "Other phone"}
          <input
            className={`${input} mt-1.5`}
            inputMode="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </label>
        <label className={label}>
          {fr ? "Site web" : "Website"}
          <input
            className={`${input} mt-1.5`}
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
          />
        </label>
        <label className={label}>
          {fr ? "Page Facebook / Instagram / TikTok" : "Facebook / Instagram / TikTok page"}
          <input
            className={`${input} mt-1.5`}
            value={form.socialUrl}
            onChange={(e) => setForm({ ...form, socialUrl: e.target.value })}
          />
        </label>
        <p className="text-[11px] leading-relaxed text-mist-500">
          {fr
            ? `Le numéro WhatsApp de votre compte (${merchant.whatsappNumber}) et le nom de votre boutique ne se changent pas ici — appelez le dispatch, nous confirmons et nous le modifions.`
            : `Your account's WhatsApp number (${merchant.whatsappNumber}) and your shop's name can't be changed here — call dispatch, we confirm and change it.`}
        </p>
      </div>

      {error && <p className="mb-3 text-sm text-restricted">{error}</p>}

      <Button onClick={save} disabled={busy} className="w-full">
        {saved ? (
          <>
            <Check className="h-4 w-4" /> {fr ? "Enregistré" : "Saved"}
          </>
        ) : fr ? (
          "Enregistrer"
        ) : (
          "Save changes"
        )}
      </Button>
    </div>
  );
}

function Toggle({
  on,
  onChange,
  title,
  hint,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  title: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex items-start justify-between gap-3 rounded-xl border border-ink-700 bg-ink-950 p-3 text-left"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-mist-100">{title}</span>
        {hint && <span className="mt-0.5 block text-[11px] leading-relaxed text-mist-500">{hint}</span>}
      </span>
      <span
        className={`mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          on ? "bg-safe" : "bg-ink-700"
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-ink-950 transition-transform ${on ? "translate-x-5" : ""}`}
        />
      </span>
    </button>
  );
}
