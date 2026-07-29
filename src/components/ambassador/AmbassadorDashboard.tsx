"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Copy, Check, Users2, Wallet, Clock, TrendingUp, MessageCircle } from "lucide-react";
import { Logo } from "@/components/shared/Logo";
import { formatXaf, cn } from "@/lib/utils";
import { buildWaLink, MAIN_WHATSAPP_NUMBER } from "@/lib/whatsapp/links";
import type { OrderStatus } from "@prisma/client";

/**
 * An ambassador's own screen: who they brought, what they earned, what we owe.
 *
 * Deliberately plain about the two things people get wrong about referral
 * schemes — commission only lands on deliveries that completed and were paid
 * for, and it stops after the customer's first N orders. Saying so here is
 * cheaper than arguing about it later.
 */

interface OrderRow {
  orderCode: string;
  createdAt: string;
  orderStatus: OrderStatus;
  commissionXaf: number;
  discountXaf: number;
}

interface LedgerRow {
  amountXaf: number;
  type: string;
  note: string | null;
  createdAt: string;
}

const card = "rounded-2xl border border-ink-700 bg-ink-900 p-4";

export function AmbassadorDashboard({
  ambassador,
  terms,
  customerCount,
  earnedXaf,
  paidXaf,
  balanceXaf,
  orders,
  ledger,
}: {
  ambassador: { code: string; fullName: string; status: string; payoutNumber: string | null };
  terms: { discountXaf: number; commissionPercent: number; orderCap: number };
  customerCount: number;
  earnedXaf: number;
  paidXaf: number;
  balanceXaf: number;
  orders: OrderRow[];
  ledger: LedgerRow[];
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const share = `Order your night delivery with Urban Night Lift and use my code ${ambassador.code} to get ${formatXaf(terms.discountXaf)} off your first order. https://urbannighlift.com/order`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(share);
    } catch {
      window.prompt("Copy this and send it:", share);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function logout() {
    await fetch("/api/ambassador-auth/logout", { method: "POST" });
    router.push("/ambassador/login");
    router.refresh();
  }

  const firstName = ambassador.fullName.trim().split(/\s+/)[0];

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-16 pt-4">
      <div className="flex items-center justify-between">
        <Logo height={28} />
        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-1.5 rounded-xl border border-ink-600 px-3 py-1.5 text-xs text-mist-300 hover:text-mist-100"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>

      <div>
        <h1 className="font-display text-2xl font-bold">Hello, {firstName}</h1>
        <p className="mt-1 text-sm text-mist-400">
          Your code is{" "}
          <span className="rounded-lg bg-violet-600/20 px-2 py-0.5 font-display font-bold tracking-wide text-violet-200">
            {ambassador.code}
          </span>
        </p>
      </div>

      {ambassador.status === "PENDING" && (
        <p className="rounded-2xl border border-gold-400/40 bg-gold-400/10 px-3 py-2.5 text-xs text-gold-200">
          Your code is not live yet — we review every ambassador before switching one on. We&apos;ll
          message you on WhatsApp as soon as it works. Nothing you share before then will earn.
        </p>
      )}

      <div className={cn(card, "flex flex-col gap-3")}>
        <p className="text-xs text-mist-400">Share this and you earn on every delivery they take.</p>
        <p className="rounded-xl border border-ink-700 bg-ink-800/60 p-3 text-xs leading-relaxed text-mist-200">
          {share}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gold-400 px-4 py-2.5 text-sm font-bold text-ink-950 hover:bg-gold-300"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy my message"}
          </button>
          <a
            href={buildWaLink("", share)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-ink-600 px-4 py-2.5 text-sm text-mist-200"
          >
            <MessageCircle className="h-4 w-4" /> Send
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat icon={Users2} label="People you brought" value={String(customerCount)} />
        <Stat icon={TrendingUp} label="Orders they placed" value={String(orders.length)} />
        <Stat icon={Wallet} label="Earned in total" value={formatXaf(earnedXaf)} />
        <Stat
          icon={Clock}
          label="Waiting to be paid"
          value={formatXaf(balanceXaf)}
          highlight={balanceXaf > 0}
        />
      </div>

      <p className={cn(card, "text-xs leading-relaxed text-mist-400")}>
        Someone using your code saves{" "}
        <span className="text-mist-200">{formatXaf(terms.discountXaf)}</span> on their first order.
        You earn <span className="text-mist-200">{terms.commissionPercent}% of our share</span> on
        each of their first <span className="text-mist-200">{terms.orderCap}</span> deliveries.
        Commission only counts on a delivery that finished and was paid for — never on a quote or a
        cancelled order. We&apos;ve paid you {formatXaf(paidXaf)} so far
        {ambassador.payoutNumber ? `, to ${ambassador.payoutNumber}` : ""}.
      </p>

      <section className={card}>
        <h2 className="mb-3 font-display text-sm font-semibold text-gold-300">Orders from your code</h2>
        {orders.length === 0 ? (
          <p className="py-4 text-center text-sm text-mist-500">
            Nobody has used your code yet. Send the message above to five people tonight.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {orders.map((o) => (
              <li
                key={o.orderCode}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-700/70 bg-ink-800/40 px-3 py-2"
              >
                <span className="font-mono text-xs text-mist-300">{o.orderCode}</span>
                <span className="text-[11px] text-mist-500">
                  {new Date(o.createdAt).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                  })}
                </span>
                <span
                  className={cn(
                    "text-xs font-semibold",
                    o.commissionXaf > 0 ? "text-safe" : "text-mist-500"
                  )}
                >
                  {o.commissionXaf > 0 ? `+${formatXaf(o.commissionXaf)}` : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {ledger.length > 0 && (
        <section className={card}>
          <h2 className="mb-3 font-display text-sm font-semibold text-gold-300">Your money, line by line</h2>
          <ul className="flex flex-col gap-1.5">
            {ledger.map((l, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-mist-400">
                  {l.type === "PAYOUT" ? "Paid to you" : l.type === "COMMISSION" ? "Commission" : "Adjustment"}
                  {l.note ? ` — ${l.note}` : ""}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-mist-500">
                    {new Date(l.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                  </span>
                  <span className={l.amountXaf >= 0 ? "text-safe" : "text-mist-300"}>
                    {l.amountXaf >= 0 ? "+" : "−"}
                    {formatXaf(Math.abs(l.amountXaf))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-center text-[11px] text-mist-500">
        Questions about a payment? Message us on WhatsApp — {MAIN_WHATSAPP_NUMBER}.
      </p>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-900 p-3">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-mist-500">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p
        className={cn(
          "mt-1 font-display text-lg font-bold",
          highlight ? "text-gold-300" : "text-mist-100"
        )}
      >
        {value}
      </p>
    </div>
  );
}
