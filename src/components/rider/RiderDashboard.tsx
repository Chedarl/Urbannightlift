"use client";

import Link from "next/link";
import { ChevronRight, Navigation, Star, Wallet } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { AvailabilityToggle } from "@/components/rider/AvailabilityToggle";
import { OrderStatusBadge } from "@/components/admin/StatusBadge";
import { SectionLabel } from "@/components/shared/portalKit";
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
  float,
}: {
  rows: RiderOrderRow[];
  stats: {
    completedTonight: number;
    activeOrderId: string | null;
    nextPickupId: string | null;
  };
  isOnline: boolean;
  earnedTonightXaf: number;
  standing: RiderStanding;
  float: { limitXaf: number; spendableXaf: number; suspended: boolean };
}) {
  const { t, locale } = useTranslation();
  const fr = locale === "fr";

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-2xl font-bold">{t("rider.dashboard.title")}</h1>

      <AvailabilityToggle initialOnline={isOnline} />

      {/* Tonight in one card. The three flat tiles that used to sit under this
          repeated numbers the earnings screen and the standing card already
          carry — three hierarchies competing for the same glance. */}
      <Link
        href="/rider/earnings"
        className="rounded-2xl border border-gold-400/40 bg-gold-400/5 p-4 transition-colors hover:border-gold-400/70"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-mist-500">{fr ? "Gagné ce soir" : "You've earned tonight"}</p>
            <p className="mt-1 font-display text-2xl font-bold text-gold-400">
              {formatXaf(earnedTonightXaf)}
            </p>
            <p className="mt-0.5 text-[11px] text-mist-500">
              {stats.completedTonight} {fr ? "terminées ce soir" : "done tonight"}
            </p>
          </div>
          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-mist-500" />
        </div>
      </Link>

      {/* Company cash. A rider must know what they can spend *before* they are
          standing at a counter with a customer's dinner on the counter. */}
      <div
        className={cn(
          "rounded-2xl border p-4",
          float.limitXaf > 0 ? "border-ink-700 bg-ink-900" : "border-caution/40 bg-caution/5"
        )}
      >
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-mist-400" />
          <p className="text-xs font-semibold text-mist-300">
            {fr ? "Caisse de la société" : "Company float"}
          </p>
        </div>
        {float.limitXaf > 0 ? (
          <>
            <p className="mt-1.5 font-display text-xl font-bold text-mist-100">
              {formatXaf(float.spendableXaf)}{" "}
              <span className="text-xs font-normal text-mist-500">
                {fr ? "à dépenser" : "left to spend"}
              </span>
            </p>
            {float.suspended && (
              <p className="mt-1 text-[11px] text-caution">
                {fr
                  ? "Suspendue — pas de nouveau réapprovisionnement."
                  : "Suspended — no new top-ups."}
              </p>
            )}
          </>
        ) : (
          <p className="mt-1.5 text-xs leading-relaxed text-caution">
            {fr
              ? "Vous n'avez pas de caisse. Sans elle, pas de courses repas, pharmacie ou marché — n'achetez jamais avec votre propre argent."
              : "You have no float. Without one you can't take food, pharmacy or grocery jobs — and you should never buy with your own money."}
          </p>
        )}
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

      <div>
        <SectionLabel>{fr ? "Vos courses" : "Your jobs"}</SectionLabel>
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
    </div>
  );
}
