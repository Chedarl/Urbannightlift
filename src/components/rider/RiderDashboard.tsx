"use client";

import Link from "next/link";
import { ChevronRight, Navigation, Star } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { AvailabilityToggle } from "@/components/rider/AvailabilityToggle";
import { OrderStatusBadge } from "@/components/admin/StatusBadge";
import { cn, formatXaf } from "@/lib/utils";
import type { RiderStanding } from "@/lib/riders/standing";
import type { OrderStatus, ServiceType } from "@prisma/client";

interface RiderOrderRow {
  id: string;
  orderCode: string;
  customerName: string;
  serviceType: ServiceType;
  pickupZone: string;
  deliveryZone: string;
  orderStatus: OrderStatus;
}

export function RiderDashboard({
  rows,
  stats,
  isOnline,
  earnedTonightXaf,
  standing,
}: {
  rows: RiderOrderRow[];
  stats: {
    assigned: number;
    completedTonight: number;
    totalDeliveries: number;
    activeOrderId: string | null;
    nextPickupId: string | null;
  };
  isOnline: boolean;
  earnedTonightXaf: number;
  standing: RiderStanding;
}) {
  const { t, locale } = useTranslation();
  const fr = locale === "fr";

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-2xl font-bold">{t("rider.dashboard.title")}</h1>

      <AvailabilityToggle initialOnline={isOnline} />

      {/* A rider should always know what tonight has been worth. */}
      <div className="rounded-2xl border border-gold-400/40 bg-gold-400/5 p-4">
        <p className="text-xs text-mist-500">You&apos;ve earned tonight</p>
        <p className="mt-1 font-display text-2xl font-bold text-gold-400">{formatXaf(earnedTonightXaf)}</p>
      </div>

      {/* Your record. A rider should be able to see what their work has been
          worth and how customers rate them, without asking anyone. */}
      <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-mist-500">{fr ? "Gagné au total" : "Earned all time"}</p>
            <p className="mt-0.5 font-display text-xl font-bold text-mist-100">{formatXaf(standing.earnedXaf)}</p>
            <p className="mt-0.5 text-[11px] text-mist-500">
              {standing.deliveries} {fr ? "livraisons terminées" : "completed deliveries"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-mist-500">{fr ? "Votre note" : "Your rating"}</p>
            {standing.rating != null ? (
              <>
                <p className="mt-0.5 flex items-center justify-end gap-1 font-display text-xl font-bold text-gold-400">
                  <Star className="h-4 w-4 fill-gold-400" /> {standing.rating.toFixed(1)}
                </p>
                <p className="mt-0.5 text-[11px] text-mist-500">
                  {standing.ratingCount} {fr ? "avis" : "ratings"}
                </p>
              </>
            ) : (
              // Never publish an average off two ratings — it misleads the
              // person it is about.
              <p className="mt-0.5 max-w-[9rem] text-[11px] text-mist-500">
                {fr ? "Pas encore assez d'avis" : "Not enough ratings yet"}
              </p>
            )}
          </div>
        </div>
        <p
          className={cn(
            "mt-3 border-t border-ink-800 pt-3 text-xs leading-relaxed",
            standing.standing === "NEEDS_CARE" ? "text-caution" : "text-mist-300"
          )}
        >
          {fr ? standing.headline.fr : standing.headline.en}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-3 text-center">
          <p className="font-display text-2xl font-bold text-gold-400">{stats.assigned}</p>
          <p className="text-xs text-mist-500">{t("rider.dashboard.assigned")}</p>
        </div>
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-3 text-center">
          <p className="font-display text-2xl font-bold text-safe">{stats.completedTonight}</p>
          <p className="text-xs text-mist-500">{t("rider.dashboard.completedTonight")}</p>
        </div>
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-3 text-center">
          <p className="font-display text-2xl font-bold">{stats.totalDeliveries}</p>
          <p className="text-xs text-mist-500">{t("rider.dashboard.totalDeliveries")}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-ink-700 bg-ink-900 p-8 text-center text-sm text-mist-500">
          {t("rider.dashboard.noOrders")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            const isActive = r.id === stats.activeOrderId;
            const isNext = r.id === stats.nextPickupId;
            return (
              <Link
                key={r.id}
                href={`/rider/orders/${r.id}`}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border bg-ink-900 p-4 transition-colors",
                  isActive
                    ? "border-gold-400/60"
                    : isNext
                      ? "border-violet-500/50"
                      : "border-ink-700 hover:border-violet-500"
                )}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-gold-400">{r.orderCode}</span>
                    {isActive && (
                      <span className="flex items-center gap-1 text-xs text-gold-300">
                        <Navigation className="h-3 w-3" /> {t("rider.dashboard.activeDelivery")}
                      </span>
                    )}
                    {isNext && <span className="text-xs text-violet-300">{t("rider.dashboard.nextPickup")}</span>}
                  </div>
                  <p className="mt-0.5 text-sm">{r.customerName}</p>
                  <p className="text-xs text-mist-500">
                    {t(`services.${r.serviceType}.name`)} · {r.pickupZone} → {r.deliveryZone}
                  </p>
                  <div className="mt-1.5">
                    <OrderStatusBadge status={r.orderStatus} />
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-mist-500" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
