"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  UtensilsCrossed,
  Pill,
  ShoppingBasket,
  Package,
  Zap,
  ClipboardList,
  Store,
  Repeat,
  Headphones,
  Package as PackageIcon,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { saveDraft, type OrderDraft } from "@/lib/orders/draft";
import { CUSTOMER_STATUS_KEY } from "@/lib/orders/statusLabels";
import { formatXaf, cn } from "@/lib/utils";
import { PageHeader } from "@/components/customer/portal/kit";
import type { OrderStatus, PaymentMethod, PreferredLanguage, ServiceType } from "@prisma/client";

/**
 * "My orders", grouped by night — Yango's rides-and-orders screen. Each row
 * is the order at a glance, a tap into its live page, and — the thing a repeat
 * customer actually wants — one tap to order it again.
 */

const ICON: Record<ServiceType, React.ElementType> = {
  FOOD_PICKUP: UtensilsCrossed,
  MEDICINE_PICKUP: Pill,
  GROCERY_PICKUP: ShoppingBasket,
  SMALL_PARCEL: Package,
  URGENT_ITEM: Zap,
  CUSTOM_ERRAND: ClipboardList,
  CONCIERGE_NIGHT: ClipboardList,
  MERCHANT_DELIVERY: Store,
};

export interface HistoryOrder {
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
  paymentMethod: PaymentMethod;
  serviceDetails: Record<string, unknown> | null;
  canReorder: boolean;
}

export function OrderHistory({
  customer,
  orders,
}: {
  customer: { fullName: string; whatsappNumber: string; preferredLanguage: PreferredLanguage };
  orders: HistoryOrder[];
}) {
  const { t, locale } = useTranslation();
  const fr = locale === "fr";
  const router = useRouter();

  // Group by calendar day, most recent first, with a friendly "Tonight" /
  // "Yesterday" heading like the reference.
  const groups = useMemo(() => {
    const map = new Map<string, HistoryOrder[]>();
    for (const o of orders) {
      const key = new Date(o.createdAt).toLocaleDateString(fr ? "fr-FR" : "en-GB", { day: "2-digit", month: "long", year: "numeric" });
      (map.get(key) ?? map.set(key, []).get(key)!).push(o);
    }
    return [...map.entries()];
  }, [orders, fr]);

  function reorder(o: HistoryOrder) {
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

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-5 px-4 pb-28 pt-6">
      <PageHeader title={fr ? "Mes commandes" : "My orders"} back="/account/profile" />

      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-ink-800 bg-ink-900 p-10 text-center">
          <PackageIcon className="h-7 w-7 text-mist-500" />
          <p className="text-sm text-mist-400">{fr ? "Aucune commande pour l'instant." : "No orders yet."}</p>
          <Link href="/order" className="rounded-xl bg-gold-400 px-5 py-2.5 text-sm font-bold text-ink-950 hover:bg-gold-300">
            {fr ? "Passer une commande" : "Place an order"}
          </Link>
        </div>
      ) : (
        groups.map(([day, list]) => (
          <section key={day}>
            <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-widest text-mist-500">{day}</p>
            <div className="flex flex-col gap-2">
              {list.map((o) => {
                const Icon = ICON[o.serviceType];
                return (
                  <div key={o.orderCode} className="rounded-2xl border border-ink-700/70 bg-ink-900 p-3.5">
                    <Link href={`/order/confirmation/${o.orderCode}`} className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-800 text-mist-300">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium text-mist-100">{o.itemDescription}</span>
                        <span className="block truncate text-xs text-mist-500">
                          {t(`services.${o.serviceType}.name`)} ·{" "}
                          {new Date(o.createdAt).toLocaleTimeString(fr ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" })} ·{" "}
                          {t(`customerStatus.${CUSTOMER_STATUS_KEY[o.orderStatus]}`)}
                        </span>
                      </span>
                      {o.feeXaf != null && <span className="shrink-0 text-sm font-semibold tabular-nums text-mist-200">{formatXaf(o.feeXaf)}</span>}
                    </Link>
                    <div className="mt-3 flex gap-2 border-t border-ink-800 pt-3">
                      <Link
                        href={`/order/confirmation/${o.orderCode}`}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink-800 py-2 text-xs font-semibold text-mist-300 hover:text-mist-100"
                      >
                        <Headphones className="h-3.5 w-3.5" /> {fr ? "Détails et aide" : "Details & help"}
                      </Link>
                      {o.canReorder && (
                        <button
                          type="button"
                          onClick={() => reorder(o)}
                          className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gold-400 py-2 text-xs font-bold text-ink-950 hover:bg-gold-300")}
                        >
                          <Repeat className="h-3.5 w-3.5" /> {fr ? "Recommander" : "Order again"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
