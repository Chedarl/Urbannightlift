"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Search, MessageCircle, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/shared/Badge";
import { buildWaLink } from "@/lib/whatsapp/links";
import { formatXaf } from "@/lib/utils";
import type { PreferredLanguage } from "@prisma/client";

export interface CustomerRow {
  id: string;
  fullName: string;
  whatsappNumber: string;
  alternativePhone: string | null;
  preferredLanguage: PreferredLanguage;
  totalOrders: number;
  orderCount: number;
  lastOrderAt: string | null;
  lifetimeFeesXaf: number;
  hasAccount: boolean;
  createdAt: string;
}

const inputCls =
  "w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2 pl-9 text-sm text-mist-100 placeholder:text-mist-500 focus:border-violet-500 focus:outline-none";

/**
 * The customer database. Staff previously had no way at all to browse customers,
 * look one up by phone, or see what they've ordered before.
 */
export function CustomersTable({
  rows,
  query,
  page,
  pageCount,
  total,
}: {
  rows: CustomerRow[];
  query: string;
  page: number;
  pageCount: number;
  total: number;
}) {
  const router = useRouter();
  const [q, setQ] = useState(query);

  function search(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    router.push(`/admin/customers${params.toString() ? `?${params}` : ""}`);
  }

  function goPage(next: number) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (next > 1) params.set("page", String(next));
    router.push(`/admin/customers${params.toString() ? `?${params}` : ""}`);
  }

  const date = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })
      : "—";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Customers</h1>
          <p className="text-xs text-mist-400">
            {total.toLocaleString()} {total === 1 ? "customer" : "customers"} in the database
          </p>
        </div>
        <a
          href={`/api/customers/export${query ? `?q=${encodeURIComponent(query)}` : ""}`}
          className="flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-medium hover:border-violet-500"
        >
          <Download className="h-4 w-4" /> Export CSV
        </a>
      </div>

      <form onSubmit={search} className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-500" />
        <input
          className={inputCls}
          placeholder="Search by name or phone number…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </form>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-ink-700 bg-ink-900 p-8 text-center">
          <Users className="h-6 w-6 text-mist-500" />
          <p className="text-sm text-mist-400">
            {query ? `No customer matches “${query}”.` : "No customers yet."}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="flex flex-col gap-2 md:hidden">
            {rows.map((c) => (
              <Link
                key={c.id}
                href={`/admin/customers/${c.id}`}
                className="rounded-2xl border border-ink-700 bg-ink-900 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-mist-100">{c.fullName}</span>
                  {c.hasAccount && <Badge tone="violet">Account</Badge>}
                </div>
                <p className="mt-0.5 text-xs text-mist-400">{c.whatsappNumber}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mist-500">
                  <span>{c.orderCount} orders</span>
                  <span>Last: {date(c.lastOrderAt)}</span>
                  <span>{formatXaf(c.lifetimeFeesXaf)}</span>
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-ink-700 md:block">
            <table className="w-full text-sm">
              <thead className="bg-ink-800 text-left text-xs uppercase tracking-wide text-mist-500">
                <tr>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">WhatsApp</th>
                  <th className="px-4 py-2.5 text-right">Orders</th>
                  <th className="px-4 py-2.5">Last order</th>
                  <th className="px-4 py-2.5 text-right">Delivery fees</th>
                  <th className="px-4 py-2.5">Lang</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t border-ink-700/70 hover:bg-ink-900/60">
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/customers/${c.id}`} className="font-medium text-mist-100 hover:text-gold-300">
                        {c.fullName}
                      </Link>
                      {c.hasAccount && <Badge tone="violet" className="ml-2">Account</Badge>}
                    </td>
                    <td className="px-4 py-2.5 text-mist-300">{c.whatsappNumber}</td>
                    <td className="px-4 py-2.5 text-right text-mist-200">{c.orderCount}</td>
                    <td className="px-4 py-2.5 text-mist-400">{date(c.lastOrderAt)}</td>
                    <td className="px-4 py-2.5 text-right text-mist-200">{formatXaf(c.lifetimeFeesXaf)}</td>
                    <td className="px-4 py-2.5 text-mist-500">{c.preferredLanguage}</td>
                    <td className="px-4 py-2.5">
                      <a
                        href={buildWaLink(c.whatsappNumber, "Urban Night Lift")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-[#25D366] px-2 py-1 text-xs font-semibold text-ink-950"
                      >
                        <MessageCircle className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => goPage(page - 1)}
                className="flex items-center gap-1 rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-mist-300 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </button>
              <span className="text-xs text-mist-500">
                Page {page} of {pageCount}
              </span>
              <button
                type="button"
                disabled={page >= pageCount}
                onClick={() => goPage(page + 1)}
                className="flex items-center gap-1 rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-mist-300 disabled:opacity-40"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
