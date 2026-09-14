"use client";

import { BellRing } from "lucide-react";
import { EnableNotifications } from "@/components/shared/EnableNotifications";

/**
 * "Tell me when my order moves."
 *
 * The system was sending customers notifications for the two moments that
 * matter most — the order being accepted with its price, and the rider being
 * dispatched — into an empty subscription set, because there was nowhere for a
 * customer to subscribe and guests were refused outright. Every one of those
 * messages went nowhere.
 *
 * This sits on the customer's own order, which is where they already are the
 * moment they care most, and works for guests: the same ownership proof that
 * unlocks the delivery code unlocks alerts for that order.
 *
 * It renders nothing when push is unconfigured or the device can't support it,
 * so it never becomes a dead promise.
 */
export function OrderAlerts({ orderCode, fr }: { orderCode: string; fr: boolean }) {
  return (
    <section className="rounded-2xl border border-violet-500/40 bg-violet-950/30 p-4">
      <p className="flex items-center gap-2 font-display text-sm font-semibold text-violet-200">
        <BellRing className="h-4 w-4" />
        {fr ? "Soyez prévenu sans rester sur la page" : "Get told without watching this page"}
      </p>
      <p className="mt-1 text-xs text-mist-300">
        {fr
          ? "Nous vous préviendrons dès que votre commande est acceptée avec son prix, et dès qu'un livreur part avec elle."
          : "We'll alert you the moment your order is accepted with its price, and again when a rider sets off with it."}
      </p>
      <EnableNotifications
        className="mt-3"
        orderCode={orderCode}
        label={fr ? "M'alerter pour cette commande" : "Alert me about this order"}
      />
      <p className="mt-2 text-xs text-mist-500">
        {fr
          ? "Sur iPhone, ajoutez d'abord le site à l'écran d'accueil. Nous vous écrirons aussi sur WhatsApp."
          : "On iPhone, add the site to your Home Screen first. We'll message you on WhatsApp as well."}
      </p>
    </section>
  );
}
