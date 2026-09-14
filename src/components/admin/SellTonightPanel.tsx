"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, Send, Loader2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SellTonight } from "@/lib/merchants/sellTonight";

/**
 * A merchant's own sales picture, and one tap to send it to them.
 *
 * The numbers are the easy half. The half that actually grows somebody's
 * business is a human telling them "brochettes are 60% of what we deliver for
 * you, and Sundays are empty" — so the send button is the point of this panel,
 * not the chart.
 *
 * When there isn't enough data the panel says so plainly and offers nothing to
 * send. Advice invented from four orders would be worse than silence.
 */
export function SellTonightPanel({ merchantId }: { merchantId: string }) {
  const [data, setData] = useState<{ report: SellTonight; message: string | null; waLink: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/admin/merchants-crm/${merchantId}/sell-tonight`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [merchantId]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-xs text-mist-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading their sales…
      </p>
    );
  }
  if (!data) return null;

  const { report, waLink } = data;
  const TrendIcon = report.trend === "GROWING" ? TrendingUp : report.trend === "FADING" ? TrendingDown : Minus;
  const trendTone =
    report.trend === "GROWING" ? "text-safe" : report.trend === "FADING" ? "text-caution" : "text-mist-400";

  return (
    <div className="rounded-2xl border border-violet-500/30 bg-violet-950/15 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-mist-100">
          <BarChart3 className="h-4 w-4 text-violet-300" /> Sell tonight
        </p>
        <span className={cn("flex items-center gap-1 text-xs font-semibold", trendTone)}>
          <TrendIcon className="h-3.5 w-3.5" />
          {report.trend === "UNKNOWN" ? "not enough history" : report.trend.toLowerCase()}
        </span>
      </div>

      <p className="mt-1 text-xs text-mist-500">
        {report.orders} completed order{report.orders === 1 ? "" : "s"} through us
      </p>

      {report.top.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {report.top.map((p) => (
            <li key={p.name} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs text-mist-200">{p.name}</span>
              {/* A share bar reads faster than a number when you are scanning. */}
              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-ink-800">
                <span className="block h-full rounded-full bg-violet-400" style={{ width: `${Math.round(p.share * 100)}%` }} />
              </span>
              <span className="w-14 shrink-0 text-right text-xs text-mist-400">
                {p.units} unit{p.units === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {report.quietNights.length > 0 && report.quietNights.length < 7 && (
        <p className="mt-3 text-xs text-caution">
          Nothing sold on {report.quietNights.join(", ")} — open room.
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2 border-t border-violet-500/20 pt-3">
        {report.advice.map((a, i) => (
          <p key={i} className="text-xs leading-relaxed text-mist-300">
            {a.en}
          </p>
        ))}
      </div>

      {/* Telling them is the product. Prefilled in French by default, which is
          the working language of most businesses here. */}
      {waLink ? (
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-safe/20 px-3 py-2.5 text-xs font-bold text-safe hover:bg-safe/30"
        >
          <Send className="h-3.5 w-3.5" /> Send these numbers on WhatsApp
        </a>
      ) : (
        <p className="mt-3 text-xs text-mist-500">
          {report.enoughData
            ? "No WhatsApp number on file for this merchant."
            : "Not enough sales yet to tell them anything useful."}
        </p>
      )}
    </div>
  );
}
