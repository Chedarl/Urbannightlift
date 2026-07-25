"use client";

import Link from "next/link";
import { formatXaf, cn } from "@/lib/utils";

/**
 * The revenue-share report.
 *
 * Two numbers here matter more than the rest. **Unsettled cash** is money
 * riders are physically holding on our behalf — the figure that decides
 * whether this is a managed business or an honour system. **Company earnings**
 * is what the operation actually kept, which turnover alone never told us.
 */

export interface RiderLine {
  riderId: string;
  riderName: string;
  deliveries: number;
  earnedXaf: number;
  companyXaf: number;
  /** Positive = the rider is holding our money. Negative = we owe the rider. */
  outstandingXaf: number;
}

export interface EarningsTotals {
  deliveries: number;
  revenueXaf: number;
  riderPayoutXaf: number;
  companyEarningXaf: number;
  unsettledCashXaf: number;
}

const RANGES = [7, 30, 90];

function Stat({ label, value, tone }: { label: string; value: string; tone?: "gold" | "safe" | "warn" }) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        tone === "gold" && "border-gold-400/40 bg-gold-400/5",
        tone === "warn" && "border-caution/40 bg-caution/10",
        !tone && "border-ink-700 bg-ink-900"
      )}
    >
      <p className="text-xs text-mist-500">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-2xl font-bold",
          tone === "gold" ? "text-gold-400" : tone === "warn" ? "text-gold-200" : "text-mist-100"
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function EarningsReport({
  days,
  totals,
  riders,
}: {
  days: number;
  totals: EarningsTotals;
  riders: RiderLine[];
}) {
  const margin =
    totals.revenueXaf > 0 ? Math.round((totals.companyEarningXaf / totals.revenueXaf) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Earnings &amp; settlement</h1>
        <div className="flex gap-2">
          {RANGES.map((d) => (
            <Link
              key={d}
              href={`/admin/earnings?days=${d}`}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                days === d
                  ? "border-gold-400 bg-gold-400/10 text-gold-300"
                  : "border-ink-700 bg-ink-900 text-mist-500 hover:text-mist-300"
              )}
            >
              {d} days
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Deliveries (${days} days)`} value={String(totals.deliveries)} />
        <Stat label="Delivery fees collected" value={formatXaf(totals.revenueXaf)} />
        <Stat label="Paid to riders" value={formatXaf(totals.riderPayoutXaf)} />
        <Stat label={`Urban Night Lift kept (${margin}%)`} value={formatXaf(totals.companyEarningXaf)} tone="gold" />
      </div>

      {totals.unsettledCashXaf > 0 && (
        <Stat label="Cash riders are still holding" value={formatXaf(totals.unsettledCashXaf)} tone="warn" />
      )}

      {riders.length === 0 ? (
        <p className="rounded-2xl border border-ink-700 bg-ink-900 p-8 text-center text-sm text-mist-500">
          No completed deliveries in this period yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-ink-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-900 text-xs uppercase tracking-wide text-mist-500">
              <tr>
                <th className="px-3 py-2">Rider</th>
                <th className="px-3 py-2">Deliveries</th>
                <th className="px-3 py-2">Rider earned</th>
                <th className="px-3 py-2">We earned</th>
                <th className="px-3 py-2">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-700">
              {riders.map((r) => (
                <tr key={r.riderId} className="bg-ink-950">
                  <td className="px-3 py-2 font-medium">{r.riderName}</td>
                  <td className="px-3 py-2 text-mist-300">{r.deliveries}</td>
                  <td className="px-3 py-2">{formatXaf(r.earnedXaf)}</td>
                  <td className="px-3 py-2 text-gold-300">{formatXaf(r.companyXaf)}</td>
                  <td className="px-3 py-2">
                    {r.outstandingXaf === 0 ? (
                      <span className="text-mist-500">Settled</span>
                    ) : r.outstandingXaf > 0 ? (
                      <span className="text-gold-200">Owes us {formatXaf(r.outstandingXaf)}</span>
                    ) : (
                      <span className="text-violet-300">We owe {formatXaf(-r.outstandingXaf)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-mist-500">
        Each delivery is split at the rate that applied on the night it was completed, so changing the share never
        rewrites past accounts. On cash orders the rider collects the full fee at the door and owes us our share; on
        MoMo and Orange the money reaches us and we owe the rider theirs.
      </p>
    </div>
  );
}
