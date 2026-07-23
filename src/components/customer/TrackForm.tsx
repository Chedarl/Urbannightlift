"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/shared/Button";

const inputCls =
  "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-violet-500 focus:outline-none";

export function TrackForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const [orderCode, setOrderCode] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setNotFound(false);
    try {
      const res = await fetch("/api/orders/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderCode, whatsappNumber }),
      });
      if (!res.ok) {
        setNotFound(true);
        return;
      }
      const data = await res.json();
      router.push(`/order/confirmation/${data.orderCode}`);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-16 pt-8">
      <h1 className="font-display text-2xl font-bold">{t("track.title")}</h1>
      <p className="text-sm text-mist-500">{t("track.subtitle")}</p>

      <div>
        <label className="mb-1 block text-sm font-medium text-mist-300">{t("track.orderCode")}</label>
        <input
          className={inputCls}
          value={orderCode}
          onChange={(e) => setOrderCode(e.target.value)}
          placeholder="UNL-XXXXXX"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-mist-300">{t("track.whatsappNumber")}</label>
        <input
          className={inputCls}
          value={whatsappNumber}
          onChange={(e) => setWhatsappNumber(e.target.value)}
          inputMode="tel"
          placeholder="+237 6XX XXX XXX"
          required
        />
      </div>

      {notFound && <p className="text-sm text-restricted">{t("track.notFound")}</p>}

      <Button type="submit" size="lg" disabled={loading}>
        <Search className="h-5 w-5" /> {t("track.find")}
      </Button>
    </form>
  );
}
