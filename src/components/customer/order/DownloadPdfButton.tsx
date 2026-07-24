"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { generateOrderPdfBlob, type OrderPdfData } from "@/components/customer/order/orderPdf";
import { cn } from "@/lib/utils";

/** Downloads the branded A4 "Order Review & Confirmation" PDF on click. */
export function DownloadPdfButton({
  data,
  label,
  className,
}: {
  data: OrderPdfData;
  label: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const blob = await generateOrderPdfBlob(data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.orderCode === "PENDING" ? "UNL-order-review" : data.orderCode}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      console.error("PDF generation failed", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "flex items-center justify-center gap-2 rounded-xl border border-gold-400/40 bg-gold-400/10 px-4 py-2.5 text-sm font-semibold text-gold-300 disabled:opacity-60",
        className
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} {label}
    </button>
  );
}
