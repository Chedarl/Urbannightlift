"use client";

import { useState } from "react";
import { ReceiptText, Loader2 } from "lucide-react";
import { generateReceiptPdfBlob, type ReceiptPdfData } from "@/components/customer/order/receiptPdf";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

/**
 * Downloads the delivery receipt — proof of payment and proof of delivery in
 * one document. Only rendered once the goods have actually been received, so
 * it can never be mistaken for a receipt for something that hasn't arrived.
 */
export function DownloadReceiptButton({
  data,
  label,
  className,
}: {
  data: ReceiptPdfData;
  label: string;
  className?: string;
}) {
  const { locale } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function onClick() {
    setBusy(true);
    setError(false);
    try {
      const blob = await generateReceiptPdfBlob(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.orderCode}-receipt.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-safe/40 bg-safe/10 px-4 py-2.5 text-sm font-semibold text-safe disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />} {label}
      </button>
      {error && (
        <span className="text-xs text-restricted">
          {locale === "fr"
            ? "Impossible de générer le reçu. Réessayez."
            : "Couldn't build the receipt. Try again."}
        </span>
      )}
    </div>
  );
}
