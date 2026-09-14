"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wallet, Power } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { OrderStatusBadge } from "@/components/admin/StatusBadge";
import { SectionLabel, CardGroup, ListRow, RowDivider } from "@/components/shared/portalKit";
import { formatXaf, cn } from "@/lib/utils";
import type { OrderStatus, ServiceType } from "@prisma/client";

interface OrderRow {
  id: string;
  orderCode: string;
  at: string;
  status: OrderStatus;
  serviceType: ServiceType;
  what: string;
  quantity: number;
}

export function MerchantHome({
  merchantName,
  acceptingOrders,
  deliveredLast30,
  float,
  orders,
}: {
  merchantName: string;
  acceptingOrders: boolean;
  deliveredLast30: number;
  float: { limitXaf: number; owedXaf: number; availableXaf: number; suspended: boolean };
  orders: OrderRow[];
}) {
  const { t, locale } = useTranslation();
  const fr = locale === "fr";
  const router = useRouter();
  const [open, setOpen] = useState(acceptingOrders);
  const [pending, startTransition] = useTransition();

  async function toggleOpen() {
    const next = !open;
    // Flip first: a shop closing at 2 AM should see it happen, not wait on a
    // round trip. Reverted if the server disagrees.
    setOpen(next);
    const res = await fetch("/api/merchant-account/shop", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acceptingOrders: next }),
    });
    if (!res.ok) setOpen(!next);
    else startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-mist-100">
          {fr ? "Bonsoir" : "Good evening"}, {merchantName}
        </h1>
        <p className="mt-1 text-sm text-mist-400">
          {deliveredLast30 > 0
            ? fr
              ? `${deliveredLast30} commandes livrées pour vous ces 30 derniers jours.`
              : `${deliveredLast30} orders delivered for you in the last 30 days.`
            : fr
              ? "Pas encore de commandes. Elles apparaîtront ici dès qu'un client vous choisit."
              : "No orders yet. They'll appear here the moment a customer picks you."}
        </p>
      </div>

      {/* The switch a shop reaches for most: the kitchen is closed, stop sending
          people. One tap, and it takes effect on the next customer's screen. */}
      <button
        type="button"
        onClick={toggleOpen}
        disabled={pending}
        className={cn(
          "flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-colors",
          open ? "border-safe/50 bg-safe/10" : "border-caution/50 bg-caution/10"
        )}
      >
        <div>
          <p className={cn("font-display text-lg font-bold", open ? "text-safe" : "text-caution")}>
            {open ? (fr ? "Ouvert aux commandes" : "Open for orders") : fr ? "Fermé" : "Closed"}
          </p>
          <p className="mt-0.5 text-xs text-mist-400">
            {open
              ? fr
                ? "Les clients peuvent vous choisir. Touchez pour fermer."
                : "Customers can pick you. Tap to close."
              : fr
                ? "Vous n'apparaissez pas aux clients. Touchez pour rouvrir."
                : "You're hidden from customers. Tap to reopen."}
          </p>
        </div>
        <Power className={cn("h-6 w-6 shrink-0", open ? "text-safe" : "text-caution")} />
      </button>

      {/* Only shown when there is a float at all — a shop without one should not
          be told about a facility it does not have. */}
      {float.limitXaf > 0 && (
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-mist-400" />
            <p className="text-xs font-semibold text-mist-300">
              {fr ? "Vos frais de livraison portés" : "Delivery fees we're carrying"}
            </p>
          </div>
          <p className="mt-1.5 font-display text-2xl font-bold text-mist-100">
            {formatXaf(float.owedXaf)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-mist-500">
            {fr
              ? `Vous réglez plus tard. Il vous reste ${formatXaf(float.availableXaf)} sur un plafond de ${formatXaf(float.limitXaf)}.`
              : `You settle later. ${formatXaf(float.availableXaf)} left of a ${formatXaf(float.limitXaf)} limit.`}
          </p>
          {float.suspended && (
            <p className="mt-2 text-xs text-caution">
              {fr
                ? "En pause — réglez ce solde pour reprendre."
                : "Paused — settle this balance to resume."}
            </p>
          )}
        </div>
      )}

      <div>
        <SectionLabel>{fr ? "Ce soir" : "Tonight"}</SectionLabel>
        {orders.length === 0 ? (
          <p className="rounded-2xl border border-ink-700 bg-ink-900 p-8 text-center text-sm text-mist-500">
            {fr ? "Rien pour le moment ce soir." : "Nothing yet tonight."}
          </p>
        ) : (
          <CardGroup>
            {orders.map((o, i) => (
              <div key={o.id}>
                {i > 0 && <RowDivider />}
                <ListRow
                  title={
                    <span className="flex items-center gap-2">
                      <span className="font-display font-bold text-gold-400">{o.orderCode}</span>
                      <span className="text-xs font-normal text-mist-500">
                        {new Date(o.at).toLocaleTimeString(fr ? "fr-FR" : "en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </span>
                  }
                  subtitle={`${t(`services.${o.serviceType}.name`)} · ${o.what.slice(0, 60)}${o.what.length > 60 ? "…" : ""}`}
                  trailing={<OrderStatusBadge status={o.status} />}
                  chevron={false}
                />
              </div>
            ))}
          </CardGroup>
        )}
        {/* Said plainly, because a merchant seeing a customer's name and number
            here would be the natural expectation and is not what happens. */}
        <p className="mt-2 px-1 text-xs leading-relaxed text-mist-500">
          {fr
            ? "Nous ne partageons pas les coordonnées des clients. Notre livreur vient chercher la commande et s'occupe du reste."
            : "We don't share customer contact details. Our rider collects the order and handles the rest."}
        </p>
      </div>
    </div>
  );
}
