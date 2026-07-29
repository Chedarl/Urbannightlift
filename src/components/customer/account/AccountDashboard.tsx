"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LogOut, Repeat, Package, User, Phone } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { saveDraft, type OrderDraft } from "@/lib/orders/draft";
import { CUSTOMER_STATUS_KEY } from "@/lib/orders/statusLabels";
import { formatXaf } from "@/lib/utils";
import type { OrderStatus, PreferredLanguage, ServiceType } from "@prisma/client";
import { refreshProfile } from "@/lib/account/profile";

export interface AccountOrderRow {
  orderCode: string;
  createdAt: string;
  orderStatus: OrderStatus;
  serviceType: ServiceType;
  itemDescription: string;
  quantity: number;
  declaredValueXaf: number;
  feeXaf: number | null;
  pickupLocation: string;
  pickupLandmark: string | null;
  deliveryLocation: string;
  deliveryLandmark: string | null;
  paymentMethod: OrderDraft["paymentMethod"];
  serviceDetails: Record<string, unknown> | null;
  canReorder: boolean;
}

const card = "rounded-2xl border border-ink-700 bg-ink-900 p-4";

export function AccountDashboard({
  customer,
  orders,
}: {
  customer: {
    fullName: string;
    whatsappNumber: string;
    preferredLanguage: PreferredLanguage;
    orderCount: number;
    lifetimeFeesXaf: number;
  };
  orders: AccountOrderRow[];
}) {
  const { t, locale } = useTranslation();
  const fr = locale === "fr";
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function logout() {
    await fetch("/api/account/logout", { method: "POST" });
    refreshProfile();
    startTransition(() => {
      router.push("/");
      router.refresh();
    });
  }

  /**
   * Reorder seeds the same client draft the order forms use, then jumps to the
   * review step so the customer can confirm before submitting.
   */
  function reorder(o: AccountOrderRow) {
    const draft: OrderDraft = {
      fullName: customer.fullName,
      whatsappNumber: customer.whatsappNumber,
      preferredLanguage: customer.preferredLanguage,
      serviceType: o.serviceType,
      itemDescription: o.itemDescription,
      quantity: o.quantity,
      declaredValueXaf: o.declaredValueXaf,
      pickupLocation: o.pickupLocation,
      pickupLandmark: o.pickupLandmark ?? "",
      deliveryLocation: o.deliveryLocation,
      deliveryLandmark: o.deliveryLandmark ?? "",
      paymentMethod: o.paymentMethod,
      itemAlreadyPaid: false,
      riderPaysAtPickup: false,
      isFragile: false,
      needsTemperatureCare: false,
      isMedicine: o.serviceType === "MEDICINE_PICKUP",
      acceptedTerms: true,
      serviceDetails: o.serviceDetails ?? undefined,
      estimatedFeeXaf: o.feeXaf,
    } as OrderDraft;
    saveDraft(draft);
    router.push("/order/review");
  }

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(fr ? "fr-FR" : "en-GB", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    });

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 pb-28 pt-4">
      <section className={card}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 font-display text-xl font-bold text-mist-100">
              <User className="h-5 w-5 text-gold-400" /> {customer.fullName}
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-mist-400">
              <Phone className="h-3.5 w-3.5" /> {customer.whatsappNumber}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            disabled={pending}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-ink-600 px-3 py-1.5 text-xs text-mist-300 hover:text-mist-100"
          >
            <LogOut className="h-3.5 w-3.5" /> {t("common.logout")}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-ink-700 bg-ink-800/60 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-mist-500">
              {fr ? "Commandes" : "Orders"}
            </p>
            <p className="mt-0.5 font-display text-base font-bold text-mist-100">{customer.orderCount}</p>
          </div>
          <div className="rounded-xl border border-ink-700 bg-ink-800/60 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-mist-500">
              {fr ? "Frais de livraison" : "Delivery fees"}
            </p>
            <p className="mt-0.5 font-display text-base font-bold text-mist-100">
              {formatXaf(customer.lifetimeFeesXaf)}
            </p>
          </div>
        </div>
      </section>

      <section className={card}>
        <h2 className="mb-3 font-display text-sm font-semibold text-gold-300">
          {fr ? "Mes commandes" : "My orders"}
        </h2>

        {orders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Package className="h-6 w-6 text-mist-500" />
            <p className="text-sm text-mist-400">
              {fr ? "Vous n'avez pas encore commandé." : "You haven't ordered yet."}
            </p>
            <Link
              href="/order"
              className="rounded-xl bg-gold-400 px-5 py-2.5 text-sm font-semibold text-ink-950 hover:bg-gold-300"
            >
              {fr ? "Passer une commande" : "Place an order"}
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {orders.map((o) => (
              <li key={o.orderCode} className="rounded-xl border border-ink-700/70 bg-ink-800/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/order/confirmation/${o.orderCode}`}
                    className="font-mono text-xs font-semibold text-gold-300 hover:text-gold-200"
                  >
                    {o.orderCode}
                  </Link>
                  <span className="text-[11px] text-mist-500">{date(o.createdAt)}</span>
                </div>
                <p className="mt-1 truncate text-sm text-mist-200">{o.itemDescription}</p>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-mist-400">
                    {t(`customerStatus.${CUSTOMER_STATUS_KEY[o.orderStatus]}`)}
                    {o.feeXaf != null && ` · ${formatXaf(o.feeXaf)}`}
                  </span>
                  {o.canReorder && (
                    <button
                      type="button"
                      onClick={() => reorder(o)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-mist-100 hover:bg-violet-500"
                    >
                      <Repeat className="h-3 w-3" /> {fr ? "Recommander" : "Reorder"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
