"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, AlertTriangle, Pill, Gem, Search, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { ORDER_FILTERS, type OrderFilter } from "@/lib/orders/filters";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/StatusBadge";
import { formatXaf, cn } from "@/lib/utils";
import type { OrderStatus, PaymentStatus, ServiceType } from "@prisma/client";

export interface OrderRow {
  id: string;
  orderCode: string;
  createdAt: string;
  customerName: string;
  serviceType: ServiceType;
  pickupZone: string;
  deliveryZone: string;
  declaredValueXaf: number;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  riderName: string | null;
  riskFlag: boolean;
  highValueFlag: boolean;
  isMedicine: boolean;
}

export function OrdersTable({
  rows,
  activeFilter,
  query = "",
}: {
  rows: OrderRow[];
  activeFilter: OrderFilter;
  query?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(query);

  function setFilter(f: OrderFilter) {
    const params = new URLSearchParams(searchParams);
    if (f === "ALL") params.delete("filter");
    else params.set("filter", f);
    router.push(`/admin/orders?${params.toString()}`);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (q.trim()) params.set("q", q.trim());
    else params.delete("q");
    router.push(`/admin/orders?${params.toString()}`);
  }

  function clearSearch() {
    setQ("");
    const params = new URLSearchParams(searchParams);
    params.delete("q");
    router.push(`/admin/orders?${params.toString()}`);
  }

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">{t("admin.orders.title")}</h1>
        <a
          href={`/api/orders/export${activeFilter !== "ALL" ? `?filter=${activeFilter}` : ""}`}
          className="flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-medium hover:border-violet-500"
        >
          <Download className="h-4 w-4" /> {t("admin.orders.exportCsv")}
        </a>
      </div>

      <form onSubmit={submitSearch} className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-500" />
        <input
          className="w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2 pl-9 pr-9 text-sm text-mist-100 placeholder:text-mist-500 focus:border-violet-500 focus:outline-none"
          placeholder="Search order code, customer name or phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {query && (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-mist-500 hover:text-mist-300"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>

      {query && (
        <p className="text-xs text-mist-400">
          {rows.length} {rows.length === 1 ? "result" : "results"} for &ldquo;{query}&rdquo;
        </p>
      )}

      {/* Filter pills */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex gap-1.5">
          {ORDER_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap",
                activeFilter === f
                  ? "border-gold-400 bg-gold-400/10 text-gold-300"
                  : "border-ink-700 bg-ink-900 text-mist-500 hover:text-mist-300"
              )}
            >
              {t(`admin.orders.filters.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-ink-700 bg-ink-900 p-8 text-center text-sm text-mist-500">
          {t("admin.orders.empty")}
        </p>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="flex flex-col gap-2 lg:hidden">
            {rows.map((r) => (
              <Link
                key={r.id}
                href={`/admin/orders/${r.id}`}
                className="rounded-2xl border border-ink-700 bg-ink-900 p-4 transition-colors hover:border-violet-500"
              >
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-gold-400">{r.orderCode}</span>
                  <span className="text-xs text-mist-500">{time(r.createdAt)}</span>
                </div>
                <p className="mt-1 text-sm font-medium">{r.customerName}</p>
                <p className="text-xs text-mist-500">
                  {t(`services.${r.serviceType}.name`)} · {r.pickupZone} → {r.deliveryZone}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <OrderStatusBadge status={r.orderStatus} />
                  <PaymentStatusBadge status={r.paymentStatus} />
                  {r.highValueFlag && <Gem className="h-3.5 w-3.5 text-gold-400" />}
                  {r.isMedicine && <Pill className="h-3.5 w-3.5 text-violet-300" />}
                  {r.riskFlag && <AlertTriangle className="h-3.5 w-3.5 text-restricted" />}
                </div>
                <p className="mt-1 text-xs text-mist-500">
                  {formatXaf(r.declaredValueXaf)} · {r.riderName ?? "—"}
                </p>
              </Link>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-ink-700 lg:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-900 text-xs uppercase tracking-wide text-mist-500">
                <tr>
                  <th className="px-3 py-2">{t("admin.orders.columns.code")}</th>
                  <th className="px-3 py-2">{t("admin.orders.columns.time")}</th>
                  <th className="px-3 py-2">{t("admin.orders.columns.customer")}</th>
                  <th className="px-3 py-2">{t("admin.orders.columns.service")}</th>
                  <th className="px-3 py-2">{t("admin.orders.columns.pickup")}</th>
                  <th className="px-3 py-2">{t("admin.orders.columns.delivery")}</th>
                  <th className="px-3 py-2">{t("admin.orders.columns.value")}</th>
                  <th className="px-3 py-2">{t("admin.orders.columns.payment")}</th>
                  <th className="px-3 py-2">{t("admin.orders.columns.status")}</th>
                  <th className="px-3 py-2">{t("admin.orders.columns.rider")}</th>
                  <th className="px-3 py-2">{t("admin.orders.columns.risk")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-700">
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/admin/orders/${r.id}`)}
                    className="cursor-pointer bg-ink-950 hover:bg-ink-900"
                  >
                    <td className="px-3 py-2 font-medium text-gold-400">{r.orderCode}</td>
                    <td className="px-3 py-2 text-mist-500">{time(r.createdAt)}</td>
                    <td className="px-3 py-2">{r.customerName}</td>
                    <td className="px-3 py-2 text-mist-300">{t(`services.${r.serviceType}.name`)}</td>
                    <td className="px-3 py-2 text-mist-500">{r.pickupZone}</td>
                    <td className="px-3 py-2 text-mist-500">{r.deliveryZone}</td>
                    <td className="px-3 py-2">{formatXaf(r.declaredValueXaf)}</td>
                    <td className="px-3 py-2"><PaymentStatusBadge status={r.paymentStatus} /></td>
                    <td className="px-3 py-2"><OrderStatusBadge status={r.orderStatus} /></td>
                    <td className="px-3 py-2 text-mist-300">{r.riderName ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        {r.highValueFlag && <Gem className="h-4 w-4 text-gold-400" />}
                        {r.isMedicine && <Pill className="h-4 w-4 text-violet-300" />}
                        {r.riskFlag && <AlertTriangle className="h-4 w-4 text-restricted" />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
