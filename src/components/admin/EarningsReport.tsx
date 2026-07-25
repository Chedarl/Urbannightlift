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

export interface FailureLine {
  reason: string;
  count: number;
  costXaf: number;
}

const FAILURE_LABEL: Record<string, string> = {
  WRONG_ADDRESS: "Couldn't find the address",
  CUSTOMER_UNREACHABLE: "Customer not reachable",
  CUSTOMER_ABSENT: "Nobody there to receive it",
  CUSTOMER_REFUSED: "Customer refused the delivery",
  PAYMENT_REFUSED: "Customer wouldn't pay",
  ACCESS_BLOCKED: "Couldn't get in",
  SAFETY: "Unsafe to continue",
  VEHICLE_ISSUE: "Bike or fuel problem",
  OTHER: "Something else",
};

/** What we'd do about each cause. A ranked list is only useful with a next step. */
const FAILURE_FIX: Record<string, string> = {
  WRONG_ADDRESS: "Ask for a landmark and a pin at checkout; the address book learns each drop-off.",
  CUSTOMER_UNREACHABLE: "Confirm the customer is reachable before dispatching the rider.",
  CUSTOMER_ABSENT: "Agree a delivery window at the quote instead of assuming.",
  CUSTOMER_REFUSED: "Check the quote was accepted before the rider set off.",
  PAYMENT_REFUSED: "Take payment before dispatch on repeat offenders.",
  ACCESS_BLOCKED: "Capture gate or security instructions on the order.",
  SAFETY: "Review the zone's safety level.",
  VEHICLE_ISSUE: "Rider equipment — not a customer problem.",
};

export function EarningsReport({
  days,
  totals,
  riders,
  failures,
}: {
  days: number;
  totals: EarningsTotals;
  riders: RiderLine[];
  failures: FailureLine[];
}) {
  const failureCount = failures.reduce((n, f) => n + f.count, 0);
  const failureCost = failures.reduce((n, f) => n + f.costXaf, 0);
  const attempts = totals.deliveries + failureCount;
  const successRate = attempts > 0 ? Math.round((totals.deliveries / attempts) * 100) : 100;
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="First-attempt success" value={`${successRate}%`} tone={successRate < 85 ? "warn" : undefined} />
        <Stat label="Failed attempts" value={String(failureCount)} />
        {totals.unsettledCashXaf > 0 && (
          <Stat label="Cash riders are still holding" value={formatXaf(totals.unsettledCashXaf)} tone="warn" />
        )}
      </div>

      {failures.length > 0 && (
        <section className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <h2 className="font-display text-sm font-semibold text-gold-300">
            Why deliveries failed — {formatXaf(failureCost)} of rider time spent with nothing delivered
          </h2>
          <p className="mt-1 text-xs text-mist-500">
            Ranked by frequency. These are trips already paid for, so the top line is the most valuable thing to fix.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {failures.map((f) => (
              <li key={f.reason} className="rounded-xl border border-ink-700 bg-ink-950 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-mist-200">{FAILURE_LABEL[f.reason] ?? f.reason}</span>
                  <span className="text-xs text-mist-400">
                    {f.count}× · {formatXaf(f.costXaf)} lost
                  </span>
                </div>
                {FAILURE_FIX[f.reason] && (
                  <p className="mt-1 text-xs text-mist-500">↳ {FAILURE_FIX[f.reason]}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
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
