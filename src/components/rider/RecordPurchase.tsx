"use client";

import { useState } from "react";
import { Receipt, Camera, Check, Loader2, AlertTriangle } from "lucide-react";
import { formatXaf, cn } from "@/lib/utils";

/**
 * The rider records what the shop actually charged.
 *
 * This is the moment the customer's money becomes a real number, so the screen
 * is built to make the honest path the easy one and the dishonest path
 * impossible:
 *
 *  - **The receipt photo comes first.** The amount field stays disabled until a
 *    photo is attached, so there is no flow in which a rider types a number
 *    without evidence behind it.
 *  - **The cap is shown while they type**, with the headroom left. A rider finds
 *    out at the counter — where they can put something back or call the
 *    customer — rather than at the door.
 *  - **Over the cap is not refused, it is flagged.** The goods are already
 *    bought; pretending otherwise would strand the rider. It records, tells them
 *    the customer must approve, and the money waits.
 *
 * It also protects the rider: a recorded amount with a photo and a timestamp is
 * their defence if anyone later says they skimmed.
 */
export function RecordPurchase({
  orderId,
  orderCode,
  capXaf,
  recordedXaf,
  fr,
  onRecorded,
}: {
  orderId: string;
  orderCode: string;
  capXaf: number | null;
  /** Already recorded — the rider sees it read-only and cannot quietly change it. */
  recordedXaf: number | null;
  fr: boolean;
  onRecorded: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ totalXaf: number; needsApproval: boolean; overByXaf: number } | null>(null);

  const typed = Number(amount);
  const valid = Number.isFinite(typed) && typed > 0;
  const overBy = valid && capXaf != null && typed > capXaf ? typed - capXaf : 0;

  async function attachReceipt(file: File) {
    setUploading(true);
    setError(null);
    try {
      const init = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: "goods-receipts", fileName: file.name, orderCode }),
      });
      if (!init.ok) throw new Error();
      const { signedUrl, path } = await init.json();
      const put = await fetch(signedUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error();
      setReceiptUrl(path);
    } catch {
      setError(fr ? "L'envoi de la photo a échoué." : "Couldn't upload that photo.");
    } finally {
      setUploading(false);
    }
  }

  async function record() {
    if (!valid || !receiptUrl) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/goods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountXaf: Math.trunc(typed), receiptUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? (fr ? "Échec de l'enregistrement." : "Couldn't record that."));
        return;
      }
      setResult({
        totalXaf: data.totalXaf,
        needsApproval: Boolean(data.needsCustomerApproval),
        overByXaf: data.overCapByXaf ?? 0,
      });
      onRecorded();
    } finally {
      setBusy(false);
    }
  }

  if (recordedXaf != null && !result) {
    return (
      <div className="rounded-2xl border border-safe/40 bg-safe/[0.06] p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-mist-100">
          <Check className="h-4 w-4 text-safe" />
          {fr ? "Achat enregistré" : "Purchase recorded"} · {formatXaf(recordedXaf)}
        </p>
        <p className="mt-1 text-xs text-mist-400">
          {fr
            ? "Pour corriger ce montant, demandez au dispatcher — c'est aussi ce qui vous protège."
            : "To correct this amount, ask dispatch — that record is also what protects you."}
        </p>
      </div>
    );
  }

  if (result) {
    return (
      <div
        className={cn(
          "rounded-2xl border p-4",
          result.needsApproval ? "border-caution/50 bg-caution/[0.06]" : "border-safe/40 bg-safe/[0.06]"
        )}
      >
        <p className="text-sm font-semibold text-mist-100">
          {fr ? "Enregistré" : "Recorded"} · {fr ? "total à percevoir" : "total to collect"} {formatXaf(result.totalXaf)}
        </p>
        {result.needsApproval && (
          <p className="mt-1 text-xs leading-relaxed text-caution">
            {fr
              ? `C'est ${formatXaf(result.overByXaf)} au-dessus de son plafond. Le client doit accepter avant que ce soit dû — prévenez-le maintenant, pas à la porte.`
              : `That's ${formatXaf(result.overByXaf)} over their cap. The customer has to approve before it's owed — tell them now, not at the door.`}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-mist-100">
        <Receipt className="h-4 w-4 text-gold-400" />
        {fr ? "Ce que le commerçant a facturé" : "What the shop charged"}
      </p>
      {capXaf != null && (
        <p className="mt-1 text-xs text-mist-400">
          {fr ? "Plafond du client" : "Customer's cap"}: {formatXaf(capXaf)}
        </p>
      )}

      {/* Photo first. No receipt, no amount — there is no path that records a
          figure without evidence behind it. */}
      <label
        className={cn(
          "mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-3 text-xs font-semibold",
          receiptUrl ? "border-safe/50 text-safe" : "border-ink-600 text-mist-300"
        )}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : receiptUrl ? (
          <Check className="h-4 w-4" />
        ) : (
          <Camera className="h-4 w-4" />
        )}
        {receiptUrl
          ? fr ? "Reçu joint" : "Receipt attached"
          : fr ? "1. Photographier le reçu" : "1. Photograph the receipt"}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) attachReceipt(f);
          }}
        />
      </label>

      <div className="mt-3">
        <p className="mb-1 text-xs font-medium text-mist-400">
          {fr ? "2. Montant exact du reçu" : "2. The exact amount on the receipt"}
        </p>
        <div className="flex items-stretch overflow-hidden rounded-xl border border-ink-700 bg-ink-800 focus-within:border-gold-400">
          <input
            className="w-full bg-transparent px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:outline-none disabled:opacity-50"
            type="number"
            min={0}
            inputMode="numeric"
            disabled={!receiptUrl}
            placeholder={receiptUrl ? "0" : fr ? "Joignez le reçu d'abord" : "Attach the receipt first"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <span className="flex items-center border-l border-ink-700 bg-ink-950/40 px-3 text-sm font-semibold text-mist-300">
            XAF
          </span>
        </div>
        <p className="mt-1 text-xs text-mist-500">
          {fr ? "Au franc près — n'arrondissez pas." : "To the franc — don't round it."}
        </p>
      </div>

      {overBy > 0 && (
        <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-caution/10 px-3 py-2 text-xs text-caution">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {fr
            ? `${formatXaf(overBy)} au-dessus de son plafond. Vous pouvez encore appeler le client depuis le comptoir.`
            : `${formatXaf(overBy)} over their cap. You can still call the customer from the counter.`}
        </p>
      )}

      {error && <p className="mt-2 text-xs text-restricted">{error}</p>}

      <button
        type="button"
        onClick={record}
        disabled={!valid || !receiptUrl || busy}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gold-400 py-3 text-sm font-bold text-ink-950 disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {fr ? "Enregistrer l'achat" : "Record the purchase"}
      </button>
    </div>
  );
}
