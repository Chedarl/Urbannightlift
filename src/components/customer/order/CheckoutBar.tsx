"use client";

import { Loader2, ShieldCheck } from "lucide-react";

import { groupXaf } from "@/lib/utils";
import type { OrderMoney } from "@/lib/orders/goodsMoney";

/**
 * The bar the order is actually placed from.
 *
 * ## What it replaces
 *
 * The review screen — the one whose entire job is "here is the price, do you
 * agree" — had no pinned anything. The total sat in a card two-thirds down a
 * long document and the submit button sat below it, so on any real order both
 * were **below the fold**: a customer scrolled past ten label/value rows, a
 * money breakdown, a PDF button and a legal paragraph before finding out
 * whether they could afford it or how to say yes.
 *
 * Every award-winning checkout in the 2025 research is the opposite of that,
 * and Baymard puts price surprise at checkout as the single largest fixable
 * cause of abandonment — 39% of shoppers who left for a fixable reason. The
 * total and the way forward are now welded to the bottom of the screen, where
 * `CartBar` already put them on the screen before this one.
 *
 * ## Why it is a second component and not a prop on `CartBar`
 *
 * They answer different questions. `CartBar` says *what this will cost* while
 * you are still choosing, and its job is to be quotable. This says *what you
 * are about to owe, and to whom*, which on a shopping order is two numbers with
 * different owners: our fee, and a ceiling on somebody else's till. Folding
 * that into the earlier bar would mean one component knowing both, and the
 * distinction between them is the thing this product has had to defend hardest.
 *
 * ## Two things it will not do
 *
 * **It never calls a ceiling a total.** On a shopping order the goods figure is
 * a cap, not a price — nobody knows what the pharmacy will charge until the
 * rider is standing at the counter. `totalIsCeiling` is rendered as "up to",
 * because presenting a ceiling as a total is how a customer ends up feeling
 * overcharged by a refund.
 *
 * **It never hides the waiver.** When the first delivery is free that is a line
 * of its own with the original fee still legible beside it. A discount that
 * simply makes a number smaller teaches nobody that they were given anything.
 */

export interface CheckoutBarProps {
  fr: boolean;
  money: OrderMoney;
  /** What the launch offer takes off, if anything. */
  waivedXaf?: number;
  /** Firm price, or one a person still has to confirm. */
  priceFirm: boolean;
  submitting: boolean;
  onSubmit: () => void;
  /** Sign-up stands here when an account is required to place an order. */
  gated?: boolean;
  cta: string;
}

export function CheckoutBar({
  fr,
  money,
  waivedXaf = 0,
  priceFirm,
  submitting,
  onSubmit,
  gated = false,
  cta,
}: CheckoutBarProps) {
  const payable = Math.max(0, money.totalXaf - waivedXaf);

  return (
    /*
      Floating rather than edge-to-edge: inset from the screen, rounded, and
      carrying its own elevation, so it reads as an object resting on the page
      rather than as a strip welded to the bottom of the browser. `z-30` keeps
      it under the bottom nav instead of colliding with it, and the safe-area
      inset keeps it off an iPhone's home indicator — both were bugs on the
      hand-rolled footers this replaces.
    */
    <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
      <div className="glass-raised mx-auto flex max-w-lg items-center gap-3 rounded-[--radius-xl] px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-1.5">
            {/*
              "Up to" is not a hedge, it is the truth: before the rider has
              bought anything, a shopping order's figure is a ceiling.
            */}
            {money.totalIsCeiling && (
              <span className="text-xs text-mist-400">{fr ? "jusqu'à" : "up to"}</span>
            )}
            <span className="font-display text-xl font-extrabold tabular-nums text-gold-400">
              {groupXaf(payable)}
            </span>
            <span className="text-xs text-mist-400">XAF</span>
          </p>

          {waivedXaf > 0 ? (
            /* The gift, said as a gift — with what it came off still legible. */
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-safe">
              <ShieldCheck className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {fr ? "Première livraison offerte" : "First delivery on us"}
                <span className="ml-1 text-mist-500 line-through tabular-nums">
                  {groupXaf(money.totalXaf)}
                </span>
              </span>
            </p>
          ) : (
            <p className="mt-0.5 truncate text-xs text-mist-500">
              {money.shopping
                ? fr
                  ? `Livraison ${groupXaf(money.deliveryFeeXaf)} · achats jusqu'à ${groupXaf(money.goodsXaf)}`
                  : `Delivery ${groupXaf(money.deliveryFeeXaf)} · goods up to ${groupXaf(money.goodsXaf)}`
                : priceFirm
                  ? fr
                    ? "Prix ferme"
                    : "This is the price"
                  : fr
                    ? "Une personne confirme ce prix"
                    : "A person confirms this price"}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="flex shrink-0 items-center gap-2 rounded-[--radius-lg] bg-gold-400 px-5 py-3 font-display text-sm font-bold text-ink-950 disabled:opacity-60"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {gated ? (fr ? "Continuer" : "Continue") : cta}
        </button>
      </div>
    </div>
  );
}
