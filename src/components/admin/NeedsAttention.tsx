"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The dispatch board's first screen: everything currently stuck, oldest first.
 *
 * The console used to be static — a new order or an arriving payment appeared
 * only if someone happened to reload. On a business that trades from 6 PM to
 * 4 AM, an unnoticed order is lost revenue and a customer who thinks we are
 * broken. This refreshes itself and makes a noise when the queue grows.
 */

export interface AttentionRow {
  id: string;
  orderCode: string;
  customerName: string;
  riderName: string | null;
  kind: string;
  waitingMinutes: number;
}

const REFRESH_MS = 20_000;

const KIND_LABEL: Record<string, string> = {
  SAFETY_FLAG: "Read this before sending a rider",
  OVER_CAP_DECLINED: "Customer refused the overspend — money is already out",
  OVER_CAP_WAITING: "Shop charged over the cap — waiting on the customer",
  GOODS_NOT_RECORDED: "Shopping done, no receipt recorded",
  RECEIPT_MISMATCH: "The receipt does not match what the rider recorded",
  CUSTOMER_NOT_TOLD: "Priced, but nobody has told the customer",
  PAYMENT_UNVERIFIED: "Payment sent — verify it",
  RIDER_SILENT: "Rider hasn't accepted",
  NO_RIDER: "Paid, no rider assigned",
  QUOTE_UNANSWERED: "Waiting on the customer to accept the price",
  TRACKING_LOST: "Rider out, but tracking has gone quiet",
  UNREVIEWED: "Not reviewed yet",
};

/**
 * How loudly to shout. Money already taken outranks everything else.
 *
 * A declined overspend is the only red in this panel, deliberately: it is the
 * one row where cash has already left the company and the customer has said no,
 * so nothing resolves it except a dispatcher deciding to absorb it, re-price it,
 * or arrange a return.
 */
const KIND_TONE: Record<string, string> = {
  // Red, like the refused-overspend row. Nothing else in this panel outranks
  // these two, and a rider already on the road cannot be un-sent.
  SAFETY_FLAG: "border-restricted/50 bg-restricted/10 text-restricted",
  OVER_CAP_DECLINED: "border-restricted/50 bg-restricted/10 text-restricted",
  OVER_CAP_WAITING: "border-gold-400/50 bg-gold-400/10 text-gold-200",
  GOODS_NOT_RECORDED: "border-gold-400/50 bg-gold-400/10 text-gold-200",
  RECEIPT_MISMATCH: "border-gold-400/50 bg-gold-400/10 text-gold-200",
  CUSTOMER_NOT_TOLD: "border-gold-400/50 bg-gold-400/10 text-gold-200",
  PAYMENT_UNVERIFIED: "border-gold-400/50 bg-gold-400/10 text-gold-200",
  RIDER_SILENT: "border-caution/40 bg-caution/10 text-caution",
  NO_RIDER: "border-caution/40 bg-caution/10 text-caution",
  QUOTE_UNANSWERED: "border-ink-600 bg-ink-900 text-mist-300",
  TRACKING_LOST: "border-caution/40 bg-caution/10 text-caution",
  UNREVIEWED: "border-violet-500/40 bg-violet-500/10 text-violet-200",
};

/** A short blip via WebAudio — no asset to load, works offline. */
function useChime() {
  const ctxRef = useRef<AudioContext | null>(null);
  return () => {
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current ??= new Ctor();
      const ctx = ctxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.36);
    } catch {
      // No audio available — the visual badge still does its job.
    }
  };
}

export function NeedsAttention({ rows }: { rows: AttentionRow[] }) {
  const router = useRouter();
  const chime = useChime();
  const [sound, setSound] = useState(true);
  const previous = useRef<number | null>(null);

  // Poll rather than push, so the board is live for whoever has it open even
  // if they never granted notification permission.
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  useEffect(() => {
    const count = rows.length;
    // Only announce growth. Re-announcing a queue that is merely still there
    // trains people to ignore the sound.
    if (previous.current !== null && count > previous.current && sound) chime();
    previous.current = count;
  }, [rows.length, sound, chime]);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-safe/30 bg-safe/5 p-4 text-sm text-safe">
        Nothing waiting. Every order is with someone.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gold-400/40 bg-gold-400/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-gold-300">
          <AlertTriangle className="h-4 w-4" />
          Needs attention ({rows.length})
        </h2>
        <button
          type="button"
          onClick={() => setSound((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink-600 px-2.5 py-1 text-xs text-mist-400 hover:text-mist-200"
          aria-label={sound ? "Mute alert sound" : "Unmute alert sound"}
        >
          {sound ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          {sound ? "Sound on" : "Muted"}
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={`${r.id}-${r.kind}`}>
            <Link
              href={`/admin/orders/${r.id}`}
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 transition-colors hover:border-violet-500",
                KIND_TONE[r.kind] ?? "border-ink-600 bg-ink-900 text-mist-300"
              )}
            >
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">{r.orderCode}</span>
                <span className="text-xs opacity-80">{r.customerName}</span>
                {r.riderName && <span className="text-xs opacity-70">· {r.riderName}</span>}
              </span>
              <span className="flex items-center gap-3 text-xs">
                <span>{KIND_LABEL[r.kind] ?? r.kind}</span>
                <span className="font-semibold tabular-nums">
                  {r.waitingMinutes < 60
                    ? `${r.waitingMinutes} min`
                    : `${Math.floor(r.waitingMinutes / 60)} h ${r.waitingMinutes % 60} min`}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
