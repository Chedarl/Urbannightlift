"use client";

import { Banknote, Check, Smartphone } from "lucide-react";

import type { PaymentMethod } from "@/lib/payments/methods";

/**
 * How this is being paid for, chosen at the moment of paying.
 *
 * ## Why it moved here
 *
 * It was a radio group buried two thirds of the way down the order form —
 * asked *before* the customer knew the price, alongside the parcel's weight and
 * the pharmacy's name, and then shown on checkout as a read-only row. So the
 * one decision that depends on what is in your MoMo wallet was taken before the
 * amount existed, and the screen where the amount finally appeared would not
 * let you change it. Changing your mind meant "Edit order" and a round trip
 * through the whole form.
 *
 * Every checkout in the 2025 study does this the other way round, and it is not
 * a style question: the method is a function of the total, so it belongs on the
 * screen with the total. The form still sets a sensible starting value; this is
 * where it is confirmed or changed.
 *
 * ## What it will not do
 *
 * **It never offers a method that cannot be completed.** The list comes from
 * `configuredPaymentMethods`, so a missing merchant code removes the option
 * rather than producing a dead end — which is exactly what Orange Money was
 * doing: chosen by roughly half the market, then a blank payment screen.
 *
 * **It never collects a PIN, a secret code, or a one-time code.** Nothing on
 * this component takes a credential. Mobile money is paid in the customer's own
 * MoMo or Orange app against a merchant code we publish; anything that asked
 * for more than that on our screen would be teaching people to be phished.
 *
 * **Choosing is not paying.** Selecting a method sets an intention. The order
 * is `PENDING` until a payment is actually verified, and no part of this
 * component touches `paymentStatus`.
 */

export interface PaymentSelectorProps {
  fr: boolean;
  methods: PaymentMethod[];
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  /** True when the goods are paid for at the shop by the rider, not by us. */
  shopping?: boolean;
}

function labelFor(method: PaymentMethod, fr: boolean) {
  switch (method) {
    case "MTN_MOMO":
      return { name: "MTN MoMo", sub: fr ? "Mobile Money" : "Mobile Money" };
    case "ORANGE_MONEY":
      return { name: "Orange Money", sub: fr ? "Orange Money" : "Orange Money" };
    case "CASH":
      return {
        name: fr ? "Espèces" : "Cash",
        sub: fr ? "À la livraison" : "When it arrives",
      };
  }
}

/** The brand mark, as a colour and two letters rather than a logo file. */
const MARK: Record<PaymentMethod, { ring: string; fill: string; ink: string }> = {
  MTN_MOMO: { ring: "border-amber-400/40", fill: "bg-amber-400/15", ink: "text-amber-300" },
  ORANGE_MONEY: { ring: "border-orange-400/40", fill: "bg-orange-400/15", ink: "text-orange-300" },
  CASH: { ring: "border-safe/40", fill: "bg-safe/15", ink: "text-safe" },
};

export function PaymentSelector({ fr, methods, value, onChange, shopping }: PaymentSelectorProps) {
  return (
    <fieldset className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-[0.08em] text-mist-500">
        {fr ? "Paiement" : "Payment"}
      </legend>

      <div className="mt-2 flex flex-col gap-2">
        {methods.map((m) => {
          const { name, sub } = labelFor(m, fr);
          const mark = MARK[m];
          const selected = m === value;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(m)}
              className={`flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${
                selected ? `${mark.ring} ${mark.fill}` : "border-ink-700 bg-ink-800 hover:border-ink-600"
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${mark.fill} ${mark.ink}`}
              >
                {m === "CASH" ? <Banknote className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-mist-100">{name}</span>
                <span className="block truncate text-xs text-mist-500">{sub}</span>
              </span>

              {selected && <Check className={`h-4 w-4 shrink-0 ${mark.ink}`} />}
            </button>
          );
        })}
      </div>

      {/*
        On a shopping order the two sums have different destinations, and saying
        so here is the difference between a customer who expects one payment and
        one who is not surprised at the door. The goods go to the shop's till;
        only the fee is ours.
      */}
      {shopping && value !== "CASH" && (
        <p className="mt-3 text-xs leading-relaxed text-mist-400">
          {fr
            ? "Vous réglez la livraison ici. Les achats se paient au commerçant, par le livreur, sur présentation du reçu."
            : "You pay the delivery here. The goods are paid at the shop by your rider, and you see the receipt."}
        </p>
      )}

      {/*
        The line that has to be on this screen and not in a help page. Nobody at
        Urban Night Lift will ever ask for a PIN, and the only defence a customer
        has against somebody who does is having read that sentence somewhere
        they trust.
      */}
      {value !== "CASH" && (
        <p className="mt-3 rounded-lg border-l-[3px] border-l-caution border border-caution/30 bg-caution/[0.06] px-3 py-2 text-xs leading-relaxed text-mist-300">
          {fr
            ? "Vous payez depuis votre propre application Mobile Money. Nous ne vous demanderons jamais votre code secret, votre PIN ou un code reçu par SMS — personne d'Urban Night Lift ne le fera."
            : "You pay from your own Mobile Money app. We will never ask for your PIN, your secret code, or a code sent to you by SMS — nobody from Urban Night Lift will."}
        </p>
      )}
    </fieldset>
  );
}
