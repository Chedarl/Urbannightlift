"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, Ban, Wallet, Phone, Users2, Copy } from "lucide-react";

import { Button } from "@/components/shared/Button";
import { Badge } from "@/components/shared/Badge";
import { formatXaf, normalizePhone, cn } from "@/lib/utils";
import { buildWaLink } from "@/lib/whatsapp/links";
import { DEFAULT_TERMS } from "@/lib/ambassadors/rules";

/**
 * The people bringing us customers, and what we owe them.
 *
 * The balance shown here is the sum of the ledger, not a stored total, so it
 * cannot drift away from the entries behind it. Paying somebody writes a
 * negative row rather than editing a number — the first disputed payment is
 * exactly when that distinction stops being academic.
 */

export interface AmbassadorRow {
  id: string;
  code: string;
  fullName: string;
  whatsappNumber: string;
  payoutMethod: string | null;
  payoutNumber: string | null;
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
  notes: string | null;
  customerCount: number;
  orderCount: number;
  earnedXaf: number;
  paidXaf: number;
  balanceXaf: number;
}

const inputCls =
  "w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-mist-100 focus:border-violet-500 focus:outline-none";

export function AmbassadorsManager({
  ambassadors,
  terms,
}: {
  ambassadors: AmbassadorRow[];
  terms: { discountXaf: number; commissionPercent: number; orderCap: number };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ fullName: "", code: "", whatsappNumber: "", payoutNumber: "" });
  const [error, setError] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  async function create() {
    setError(null);
    const res = await fetch("/api/ambassadors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Couldn't add them");
      return;
    }
    setCreating(false);
    setForm({ fullName: "", code: "", whatsappNumber: "", payoutNumber: "" });
    startTransition(() => router.refresh());
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/ambassadors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "That didn't work");
      return;
    }
    setPayingId(null);
    setPayAmount("");
    startTransition(() => router.refresh());
  }

  async function copyCode(code: string) {
    const text = `Use my Urban Night Lift code ${code} and get ${formatXaf(terms.discountXaf)} off your first night delivery. https://urbannighlift.com/order`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy this and send it to them:", text);
    }
    setCopied(code);
    setTimeout(() => setCopied(null), 2500);
  }

  const owed = ambassadors.reduce((s, a) => s + a.balanceXaf, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold">Ambassadors</h1>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus className="h-4 w-4" /> Add an ambassador
        </Button>
      </div>

      <p className="rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-xs text-mist-400">
        A referred customer saves <span className="text-mist-200">{formatXaf(terms.discountXaf)}</span> on
        their first order. The ambassador earns{" "}
        <span className="text-mist-200">{terms.commissionPercent}% of our share</span> on that customer&apos;s
        first <span className="text-mist-200">{terms.orderCap}</span> deliveries — roughly{" "}
        {formatXaf(Math.round((600 * terms.commissionPercent) / 100))} on a typical 1,500 XAF fee. Both come
        out of our margin; the rider is always paid on the full fee.
        {owed > 0 && (
          <>
            {" "}
            <span className="text-gold-300">Currently owing {formatXaf(owed)} in total.</span>
          </>
        )}
      </p>

      {error && (
        <p className="rounded-xl border border-restricted/40 bg-restricted/10 px-3 py-2 text-xs text-restricted">
          {error}
        </p>
      )}

      {creating && (
        <div className="grid gap-2 rounded-2xl border border-gold-400/30 bg-ink-900 p-4 sm:grid-cols-2">
          <input
            className={inputCls}
            placeholder="Their name"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          />
          <input
            className={inputCls}
            placeholder="Code they chose (e.g. MARIE)"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          />
          <input
            className={inputCls}
            placeholder="WhatsApp number"
            value={form.whatsappNumber}
            onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })}
          />
          <input
            className={inputCls}
            placeholder="MoMo / Orange number for payouts"
            value={form.payoutNumber}
            onChange={(e) => setForm({ ...form, payoutNumber: e.target.value })}
          />
          <Button
            size="sm"
            className="sm:col-span-2"
            onClick={create}
            disabled={pending || form.fullName.length < 2 || form.code.length < 4}
          >
            Add them
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {ambassadors.length === 0 && (
          <p className="rounded-2xl border border-ink-700 bg-ink-900 p-6 text-center text-sm text-mist-500">
            No ambassadors yet. Add someone with a following — a student rep, a hostel manager, a barber —
            and give them a code they picked themselves.
          </p>
        )}

        {ambassadors.map((a) => (
          <div key={a.id} className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-violet-600/20 px-2 py-0.5 font-display text-sm font-bold tracking-wide text-violet-200">
                  {a.code}
                </span>
                <span className="font-display font-semibold">{a.fullName}</span>
                {a.status === "ACTIVE" && <Badge tone="safe">Active</Badge>}
                {a.status === "PENDING" && <Badge tone="caution">Waiting for approval</Badge>}
                {a.status === "SUSPENDED" && <Badge tone="restricted">Suspended</Badge>}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => copyCode(a.code)}>
                  <Copy className="h-3.5 w-3.5" /> {copied === a.code ? "Copied" : "Copy their message"}
                </Button>
                <a
                  href={buildWaLink(normalizePhone(a.whatsappNumber), "")}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-ink-700 px-2.5 py-1.5 text-xs text-mist-300 hover:text-mist-100"
                >
                  <Phone className="h-3.5 w-3.5" /> Message
                </a>
                {a.status !== "ACTIVE" ? (
                  <Button size="sm" onClick={() => patch(a.id, { status: "ACTIVE" })} disabled={pending}>
                    <Check className="h-4 w-4" /> Approve
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => patch(a.id, { status: "SUSPENDED" })}
                    disabled={pending}
                  >
                    <Ban className="h-4 w-4" /> Suspend
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mist-500">
              <span className="flex items-center gap-1">
                <Users2 className="h-3.5 w-3.5" /> {a.customerCount} customers · {a.orderCount} orders
              </span>
              <span>Earned {formatXaf(a.earnedXaf)}</span>
              <span>Paid {formatXaf(a.paidXaf)}</span>
              <span className={cn("font-semibold", a.balanceXaf > 0 ? "text-gold-300" : "text-mist-500")}>
                Owing {formatXaf(a.balanceXaf)}
              </span>
              {a.payoutNumber && <span>Pays to {a.payoutNumber}</span>}
            </div>

            {a.balanceXaf > 0 && (
              <div className="mt-3">
                {payingId === a.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className={cn(inputCls, "w-32")}
                      inputMode="numeric"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder={String(a.balanceXaf)}
                    />
                    <Button
                      size="sm"
                      onClick={() => patch(a.id, { payoutXaf: Number(payAmount) || a.balanceXaf })}
                      disabled={pending}
                    >
                      Record payment
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPayingId(null)}>
                      Cancel
                    </Button>
                    <span className="text-[11px] text-mist-500">
                      Send the money on MoMo first, then record it here.
                    </span>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setPayingId(a.id)} disabled={pending}>
                    <Wallet className="h-4 w-4" /> Mark {formatXaf(a.balanceXaf)} as paid
                  </Button>
                )}
              </div>
            )}

            {a.notes && <p className="mt-2 text-[11px] text-mist-500">{a.notes}</p>}
          </div>
        ))}
      </div>

      <p className="text-[11px] text-mist-500">
        Commission is only earned on deliveries that completed and were paid for — never on a quote, a
        cancelled order, or a test order. Default terms: {formatXaf(DEFAULT_TERMS.discountXaf)} off,{" "}
        {DEFAULT_TERMS.commissionPercent}% of our share, first {DEFAULT_TERMS.orderCap} orders.
      </p>
    </div>
  );
}
