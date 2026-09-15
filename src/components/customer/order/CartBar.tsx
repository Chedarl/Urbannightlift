"use client";

import type { ReactNode } from "react";

import { groupXaf } from "@/lib/utils";
import type { LiveFare } from "@/lib/orders/useLiveFare";

/**
 * The bar welded to the bottom of every order screen.
 *
 * ## Why this exists as one component
 *
 * It is the single most valuable thing the study of Meituan and Ele.me turned
 * up. Both keep the running total and the way forward pinned to the bottom of
 * every screen inside a merchant: you never lose the thread, never wonder what
 * it costs, never hunt for the button. Ours goes one further and puts the
 * **delivery fee** on that line — the number customers actually argue about,
 * said while they are still choosing rather than after they have committed.
 *
 * Food, medicine and parcel each had their own hand-rolled footer. They drifted
 * — different heights, different z-indexes, one of them sitting *under* the
 * bottom nav — and each one phrased the price differently, which is how a
 * customer ends up believing food and parcel are priced by different rules.
 * One bar, three screens.
 *
 * ## The three things it will not do
 *
 * **It never invents a price.** With no fee yet it says what is missing, in
 * words. A placeholder number on this line would be the most expensive lie in
 * the product.
 *
 * **It marks an estimate as an estimate.** A zone-only figure reads "about
 * 1,500", never "1,500". The distance-based figure is the confident one.
 *
 * **It never calls the goods a total.** The shop's price and our fee are
 * different numbers with different owners, and conflating them once put an
 * 8,000 XAF "delivery fee" on a 6,500 XAF meal.
 */

export interface CartBarProps {
  fr: boolean;
  /** The accent this service runs on — amber for food, green for medicine. */
  accent: "amber" | "emerald" | "sky";
  /** Left slot: a cart glyph, a parcel glyph, a count badge. */
  glyph: ReactNode;
  /** What the shop will charge, where we know it. Never called a total. */
  goodsXaf?: number | null;
  /** True when some chosen item has no price on file. */
  goodsPartial?: boolean;
  /** Our fee, quoted live. Null until there is enough to price. */
  fare: LiveFare | null;
  /** What is still missing, in the customer's words. Shown once they try. */
  missing?: string[];
  /** Shown when they have not tried yet and there is no fee to show. */
  hint?: string;
  cta: string;
  onCta: () => void;
  disabled?: boolean;
}

const ACCENTS = {
  amber: { fill: "bg-amber-500", ink: "text-black", price: "text-amber-300" },
  emerald: { fill: "bg-emerald-500", ink: "text-black", price: "text-emerald-300" },
  sky: { fill: "bg-gold-400", ink: "text-ink-950", price: "text-gold-300" },
} as const;

export function CartBar({
  fr,
  accent,
  glyph,
  goodsXaf,
  goodsPartial,
  fare,
  missing,
  hint,
  cta,
  onCta,
  disabled,
}: CartBarProps) {
  const tone = ACCENTS[accent];
  const short = missing && missing.length > 0;

  return (
    /*
      z-30 keeps it under the bottom nav (z-40) rather than colliding with it,
      and the safe-area inset keeps it off an iPhone's home indicator. Both were
      bugs on the old per-screen footers.
    */
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-700 bg-ink-950/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <div className="shrink-0">{glyph}</div>

        <div className="min-w-0 flex-1">
          {fare ? (
            <>
              <p className="flex items-baseline gap-1.5">
                <span className={`font-display text-xl font-extrabold tabular-nums ${tone.price}`}>
                  {fare.estimated && (fr ? "≈ " : "≈ ")}
                  {groupXaf(fare.totalXaf)}
                </span>
                <span className="text-xs text-mist-400">{fr ? "livraison" : "delivery"}</span>
              </p>
              {/*
                The working, in one line. "850 + 6.3 km" is a reason; a bare
                number is a rule, and people argue with rules.
              */}
              <p className="truncate text-xs tabular-nums text-mist-500">
                {fare.lines
                  .map((l) => (fr ? l.labelFr : l.label))
                  .slice(0, 3)
                  .join(" · ")}
                {goodsXaf != null && goodsXaf > 0 && (
                  <>
                    {" · "}
                    {fr ? "articles " : "goods "}
                    {groupXaf(goodsXaf)}
                    {goodsPartial && (fr ? " +" : " +")}
                  </>
                )}
              </p>
            </>
          ) : goodsXaf != null && goodsXaf > 0 ? (
            <>
              <p className="flex items-baseline gap-1.5">
                <span className={`font-display text-xl font-extrabold tabular-nums ${tone.price}`}>
                  {groupXaf(goodsXaf)}
                </span>
                <span className="text-xs text-mist-400">
                  {goodsPartial
                    ? fr
                      ? "+ articles sans prix"
                      : "+ unpriced items"
                    : fr
                      ? "à la boutique"
                      : "at the shop"}
                </span>
              </p>
              <p className="truncate text-xs text-mist-500">
                {short
                  ? `${fr ? "Il manque : " : "Still needed: "}${missing.join(", ")}`
                  : fr
                    ? "Posez l'épingle de livraison pour voir le prix"
                    : "Drop the delivery pin to see the fee"}
              </p>
            </>
          ) : (
            <p className="text-xs leading-snug text-mist-400">
              {short
                ? `${fr ? "Il manque : " : "Still needed: "}${missing.join(", ")}`
                : (hint ??
                  (fr
                    ? "Posez l'épingle de livraison pour voir le prix"
                    : "Drop the delivery pin to see the fee"))}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onCta}
          disabled={disabled}
          className={`shrink-0 rounded-xl px-5 py-3 font-display text-sm font-bold ${tone.fill} ${tone.ink} disabled:opacity-50`}
        >
          {cta}
        </button>
      </div>
    </div>
  );
}
