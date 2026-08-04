"use client";

import { useState } from "react";
import { ScanLine, Loader2, Copy, Check } from "lucide-react";

/**
 * Reads the payment screenshot so a dispatcher does not have to squint at one.
 *
 * Verifying a payment means opening an image, finding a transaction reference
 * on somebody's phone screenshot, and typing it into a box. At 1 AM, repeatedly,
 * that is where the "customer paid and is now waiting for a human to notice"
 * gap actually lives.
 *
 * **It suggests; it never verifies.** Nothing here changes the payment status,
 * and the reference is offered to copy rather than written anywhere. The
 * dispatcher is still the one who decides money arrived, because that decision
 * releases somebody's goods to a rider.
 *
 * On demand rather than on load: a call costs money and most orders never need
 * one, so it happens when somebody actually asks.
 */
export function ProofReader({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    error?: string;
    reading?: { reference: string | null; amountXaf: number | null; senderPhone: string | null; provider: string | null };
    expectedXaf?: number | null;
    amountMatches?: boolean | null;
  } | null>(null);

  async function read() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/read-proof`, { method: "POST" });
      setResult(await res.json());
    } catch {
      setResult({ ok: false, error: "Couldn't reach the server." });
    } finally {
      setBusy(false);
    }
  }

  function copy(text: string) {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {}
    );
  }

  const reading = result?.ok ? result.reading : null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={read}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-600/15 px-2.5 py-1 text-xs font-semibold text-violet-300 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
        {busy ? "Reading…" : "Read the screenshot"}
      </button>

      {result && !result.ok && (
        <p className="mt-2 text-xs leading-relaxed text-mist-400">{result.error}</p>
      )}

      {reading && (
        <div className="mt-2 rounded-lg border border-ink-700 bg-ink-950 p-2 text-xs">
          <p className="mb-1 text-mist-500">
            What the screenshot appears to say — check it against the image before you verify.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-mist-500">Reference</span>
            <span className="font-mono font-semibold text-mist-100">{reading.reference}</span>
            <button
              type="button"
              onClick={() => copy(reading.reference ?? "")}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-mist-500 hover:text-mist-200"
            >
              {copied ? <Check className="h-3 w-3 text-safe" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
          {reading.amountXaf != null && (
            <p className="mt-1">
              <span className="text-mist-500">Amount </span>
              <span className="text-mist-100">{reading.amountXaf.toLocaleString("fr-FR")} XAF</span>
              {/* The one comparison worth surfacing: a screenshot for a
                  different amount than the order expects is the thing a
                  dispatcher is really checking for. */}
              {result?.amountMatches === false && result.expectedXaf != null && (
                <span className="text-caution">
                  {" "}
                  — the order expects {result.expectedXaf.toLocaleString("fr-FR")} XAF
                </span>
              )}
              {result?.amountMatches === true && <span className="text-safe"> — matches</span>}
            </p>
          )}
          {reading.senderPhone && (
            <p className="mt-1">
              <span className="text-mist-500">From </span>
              <span className="text-mist-100">{reading.senderPhone}</span>
              {reading.provider && <span className="text-mist-500"> · {reading.provider}</span>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
