"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, X, ShieldCheck, Clock, MapPin, Package, Phone } from "lucide-react";

import { Logo } from "@/components/shared/Logo";
import { formatXaf } from "@/lib/utils";
import { formatSlot } from "@/lib/orders/timeSlots";

/**
 * The price, on its own page, at the end of a link we can send.
 *
 * Quoting used to update the database and send a push notification — which
 * almost no guest is subscribed to — while the WhatsApp message dispatch sent
 * by hand said "confirm on your order page" without saying where that was. So a
 * priced order sat waiting on a customer who had been given a price and no way
 * to agree to it, and the board showed "waiting for the customer" when the
 * customer had never been reachable in the first place.
 *
 * This is what that message now links to: one screen, one number, two buttons.
 * Accepting here releases the order for a rider; declining cancels it before
 * anyone rides anywhere, which is far cheaper than a refusal at the door.
 */

export interface QuoteView {
  orderCode: string;
  feeXaf: number;
  itemDescription: string;
  deliveryLocation: string;
  preferredDeliveryTime: string | null;
  note: string | null;
  customerName: string;
  accepted: boolean;
  declined: boolean;
  cancelled: boolean;
  /** True when this device already proved it owns the order. */
  verified: boolean;
}

export function QuotePage({ quote, fr }: { quote: QuoteView; fr: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDecline, setShowDecline] = useState(false);
  const [reason, setReason] = useState("");
  // Opening the link on a different phone from the one that ordered is normal,
  // so ask for the number rather than refusing. It is also what stops a stranger
  // with an order code from accepting a price on someone else's behalf.
  const [phone, setPhone] = useState("");

  async function answer(accept: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/track/${quote.orderCode}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accept,
          reason: accept ? undefined : reason,
          ...(quote.verified ? {} : { whatsappNumber: phone }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          res.status === 403
            ? fr
              ? "Ce numéro ne correspond pas à la commande. Saisissez le numéro WhatsApp utilisé pour commander."
              : "That number doesn't match this order. Enter the WhatsApp number you ordered with."
            : (data.error ??
              (fr ? "Une erreur s'est produite." : "Something went wrong."))
        );
        return;
      }
      router.refresh();
    } catch {
      setError(fr ? "Connexion impossible. Réessayez." : "Couldn't connect. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-16">
      <div className="flex justify-center py-6">
        <Logo height={34} />
      </div>
      {children}
      <p className="mt-6 text-center text-[11px] text-mist-500">
        {fr
          ? "Urban Night Lift — livraison de nuit à Yaoundé, 18h à 4h."
          : "Urban Night Lift — night delivery across Yaoundé, 6 PM to 4 AM."}
      </p>
    </main>
  );

  if (quote.cancelled) {
    return (
      <Shell>
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-6 text-center">
          <h1 className="font-display text-xl font-bold">
            {fr ? "Cette commande a été annulée" : "This order was cancelled"}
          </h1>
          <p className="mt-2 text-sm text-mist-400">
            {fr ? `Commande ${quote.orderCode}.` : `Order ${quote.orderCode}.`}
          </p>
          <Link href="/order" className="mt-5 inline-block text-sm font-semibold text-gold-300">
            {fr ? "Passer une nouvelle commande" : "Place a new order"}
          </Link>
        </div>
      </Shell>
    );
  }

  if (quote.accepted) {
    return (
      <Shell>
        <div className="rounded-2xl border border-safe/30 bg-safe/5 p-6 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-safe/15 text-safe">
            <Check className="h-7 w-7" />
          </span>
          <h1 className="mt-4 font-display text-xl font-bold">
            {fr ? "Prix accepté — merci" : "Price accepted — thank you"}
          </h1>
          <p className="mt-2 text-sm text-mist-300">
            {fr
              ? `Nous assignons un livreur à la commande ${quote.orderCode}. Vous serez prévenu dès qu'il part.`
              : `We're assigning a rider to order ${quote.orderCode}. You'll hear from us as soon as they set off.`}
          </p>
          <Link
            href={`/order/confirmation/${quote.orderCode}`}
            className="mt-5 inline-block rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-950"
          >
            {fr ? "Suivre ma commande" : "Track my order"}
          </Link>
        </div>
      </Shell>
    );
  }

  if (quote.declined) {
    return (
      <Shell>
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-6 text-center">
          <h1 className="font-display text-xl font-bold">
            {fr ? "Prix refusé" : "Price declined"}
          </h1>
          <p className="mt-2 text-sm text-mist-400">
            {fr
              ? "Nous n'avons rien facturé et personne n'a été envoyé. Vous pouvez recommander quand vous voulez."
              : "Nothing was charged and nobody was sent. You can order again whenever you like."}
          </p>
          <Link href="/order" className="mt-5 inline-block text-sm font-semibold text-gold-300">
            {fr ? "Passer une nouvelle commande" : "Place a new order"}
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="overflow-hidden rounded-2xl border border-gold-400/40 bg-gradient-to-b from-gold-400/10 to-ink-900">
        <div className="px-6 pt-6 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-gold-300">
            {fr ? "Votre commande est acceptée" : "Your order is accepted"}
          </p>
          <h1 className="mt-1 font-display text-lg font-bold text-mist-100">
            {fr ? "Commande" : "Order"} {quote.orderCode}
          </h1>

          <p className="mt-5 text-xs text-mist-400">{fr ? "Frais de livraison" : "Delivery fee"}</p>
          <p className="font-display text-4xl font-bold text-gold-300">{formatXaf(quote.feeXaf)}</p>
          <p className="mt-1 text-[11px] text-mist-500">
            {fr
              ? "Prix fixe. Le coût de vos articles se règle séparément."
              : "Fixed price. The cost of your items is settled separately."}
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-2 border-t border-ink-700 px-6 py-4 text-sm">
          <p className="flex items-start gap-2 text-mist-300">
            <Package className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" />
            <span>{quote.itemDescription}</span>
          </p>
          <p className="flex items-start gap-2 text-mist-300">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" />
            <span>{quote.deliveryLocation}</span>
          </p>
          {quote.preferredDeliveryTime && (
            <p className="flex items-start gap-2 text-mist-300">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gold-300" />
              <span>{formatSlot(quote.preferredDeliveryTime, fr)}</span>
            </p>
          )}
        </div>

        {quote.note && (
          <p className="mx-6 mb-4 rounded-xl border border-ink-700 bg-ink-800 p-3 text-xs text-mist-300">
            {quote.note}
          </p>
        )}

        <div className="px-6 pb-6">
          {!quote.verified && (
            <div className="mb-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs text-mist-400">
                <Phone className="h-3.5 w-3.5 text-gold-300" />
                {fr
                  ? "Confirmez le numéro WhatsApp utilisé pour commander"
                  : "Confirm the WhatsApp number you ordered with"}
              </p>
              <div className="flex">
                <span className="flex shrink-0 items-center gap-1 rounded-l-xl border border-r-0 border-ink-700 bg-ink-800 px-2.5 text-sm text-mist-300">
                  🇨🇲 +237
                </span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  placeholder="6 90 12 34 56"
                  className="w-full rounded-r-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-gold-400 focus:outline-none"
                />
              </div>
            </div>
          )}

          {error && (
            <p className="mb-3 rounded-xl border border-restricted/40 bg-restricted/10 px-3 py-2 text-xs text-restricted">
              {error}
            </p>
          )}

          {!showDecline ? (
            <>
              <button
                type="button"
                onClick={() => answer(true)}
                disabled={busy || (!quote.verified && phone.replace(/\D/g, "").length < 9)}
                className="w-full rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 py-3.5 font-display text-base font-semibold text-ink-950 disabled:opacity-50"
              >
                <Check className="mr-1.5 inline h-5 w-5" />
                {busy
                  ? fr ? "Envoi…" : "Sending…"
                  : fr ? `Accepter ${formatXaf(quote.feeXaf)}` : `Accept ${formatXaf(quote.feeXaf)}`}
              </button>
              <button
                type="button"
                onClick={() => setShowDecline(true)}
                disabled={busy}
                className="mt-2 w-full rounded-2xl border border-ink-600 py-3 text-sm font-medium text-mist-400"
              >
                <X className="mr-1.5 inline h-4 w-4" />
                {fr ? "Ce prix ne me convient pas" : "This price doesn't work for me"}
              </button>
            </>
          ) : (
            <>
              <p className="mb-2 text-xs text-mist-400">
                {fr
                  ? "Dites-nous pourquoi — cela nous aide à ajuster nos prix."
                  : "Tell us why — it helps us get our pricing right."}
              </p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 300))}
                rows={3}
                placeholder={fr ? "Trop cher pour cette distance…" : "Too expensive for this distance…"}
                className="w-full rounded-xl border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-500 focus:border-gold-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => answer(false)}
                disabled={busy || (!quote.verified && phone.replace(/\D/g, "").length < 9)}
                className="mt-2 w-full rounded-2xl border border-restricted/50 bg-restricted/10 py-3 text-sm font-semibold text-restricted disabled:opacity-50"
              >
                {fr ? "Refuser et annuler" : "Decline and cancel"}
              </button>
              <button
                type="button"
                onClick={() => setShowDecline(false)}
                className="mt-2 w-full py-2 text-xs text-mist-500"
              >
                {fr ? "Retour" : "Back"}
              </button>
            </>
          )}
        </div>
      </div>

      <p className="mt-4 flex items-start gap-2 rounded-xl border border-ink-700 bg-ink-900/50 p-3 text-[11px] text-mist-500">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-safe" />
        {fr
          ? "Nous ne demandons jamais votre code PIN MoMo ou Orange Money. Rien n'est prélevé tant que vous n'avez pas accepté."
          : "We never ask for your MoMo or Orange Money PIN. Nothing is charged until you accept."}
      </p>
    </Shell>
  );
}
