"use client";

import { ShieldCheck } from "lucide-react";
import { formatXaf, cn } from "@/lib/utils";
import type { OrderMoney } from "@/lib/orders/goodsMoney";
import type { FareLine } from "@/lib/orders/fare";

/**
 * The arithmetic, shown rather than asserted.
 *
 * Handing somebody your money at 1 AM to go shopping is the most
 * suspicion-prone thing this product does, and the fear is specific: *they
 * bought it for 4,000, told me 5,500, and kept the rest*. A single blended
 * "Total: 6,500" is exactly what somebody doing that would show you.
 *
 * So nothing here is blended. The goods are one line, our fee is another and is
 * labelled as ours, and the total is their sum. Before the rider has bought
 * anything the goods line says "up to", because that is the truth and any other
 * wording is a promise we cannot keep. Afterwards it shows the shop's figure —
 * and, when the shop charged less than the cap, it says so explicitly. Telling
 * someone we charged them *less than we were allowed to* is the single most
 * convincing thing on the screen, and it costs nothing.
 *
 * The no-markup line is printed, not implied. An unstated policy convinces
 * nobody.
 */
export function MoneyBreakdown({
  money,
  /** What the customer asked us to buy, for the itemised lines. */
  items = [],
  /** The cap they agreed to, so we can show what they saved. */
  capXaf = null,
  /** On mobile money the goods are handed over in cash at the door. */
  goodsAtDoor = false,
  /**
   * How the delivery fee was arrived at, step by step.
   *
   * This is the answer to the actual complaint about pricing. A customer handed
   * a bare number compares it with what they paid last week and concludes they
   * are being charged at random; a customer shown "up to 2 km, 1,000 · 6.9 km
   * further, 1,380" is being told the reason, and the reason is one they can
   * check against the map in their own head. "You are far away" is an argument
   * a person can accept. "You are in the red zone" is not.
   */
  fareLines = [],
  /** True when nothing was pinned, so the figure is honestly approximate. */
  fareEstimated = false,
  fr,
  className,
}: {
  money: OrderMoney;
  items?: { name: string; qty?: number }[];
  capXaf?: number | null;
  goodsAtDoor?: boolean;
  fareLines?: FareLine[];
  fareEstimated?: boolean;
  fr: boolean;
  className?: string;
}) {
  const saved =
    money.goodsSettled && capXaf != null && capXaf > money.goodsXaf ? capXaf - money.goodsXaf : 0;

  return (
    <div className={cn("rounded-2xl border border-ink-700 bg-ink-900/60 p-4", className)}>
      {money.shopping && items.length > 0 && (
        <>
          <p className="text-xs font-bold uppercase tracking-widest text-mist-500">
            {fr ? "Ce que vous nous demandez d'acheter" : "What you asked us to buy"}
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {items.map((it, i) => (
              <li key={i} className="flex justify-between gap-3 text-sm text-mist-300">
                <span className="min-w-0 truncate">
                  {it.qty && it.qty > 1 ? `${it.qty}× ` : ""}
                  {it.name}
                </span>
              </li>
            ))}
          </ul>
          <div className="my-3 border-t border-ink-800" />
        </>
      )}

      <div className="flex flex-col gap-2">
        {money.shopping && (
          <Line
            label={
              money.goodsSettled
                ? fr ? "Articles (prix payé au commerçant)" : "Items (what the shop charged)"
                : fr ? "Articles — jusqu'à" : "Items — up to"
            }
            value={formatXaf(money.goodsXaf)}
            muted={!money.goodsSettled}
          />
        )}
        <Line
          label={fr ? "Frais de livraison (notre part)" : "Delivery fee (ours)"}
          value={formatXaf(money.deliveryFeeXaf)}
        />
        {/* The fee, broken into the reasons for it. Indented under the fee it
            explains, so it reads as the working rather than as extra charges —
            these are the parts of that one number, not additions to it. */}
        {fareLines.length > 1 && (
          <ul className="ml-3 flex flex-col gap-1 border-l border-ink-700 pl-3">
            {fareLines.map((l, i) => (
              <li key={i} className="flex justify-between gap-3 text-xs text-mist-400">
                <span className="min-w-0 truncate">{fr ? l.labelFr : l.label}</span>
                <span className="shrink-0 tabular-nums">{formatXaf(l.amountXaf)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Said plainly rather than hidden, because a fee that moves once the
          rider knows where they are going is the thing customers most resent
          being surprised by. */}
      {fareEstimated && (
        <p className="mt-2 text-xs leading-relaxed text-mist-400">
          {fr
            ? "Estimation : nous n'avons pas encore de point précis pour les deux adresses. Placez un repère et le prix se calcule sur la distance réelle."
            : "An estimate: we don't have a precise point for both addresses yet. Drop a pin and the price is worked out on the real distance."}
        </p>
      )}

      <div className="my-3 border-t border-ink-700" />

      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-sm font-bold text-mist-100">
          {money.totalIsCeiling ? (fr ? "Total maximum" : "Total at most") : fr ? "Total" : "Total"}
        </span>
        <span className="font-display text-xl font-bold text-gold-400">{formatXaf(money.totalXaf)}</span>
      </div>

      {/* Charging less than we were allowed to is worth saying out loud. */}
      {saved > 0 && (
        <p className="mt-2 rounded-xl bg-safe/10 px-3 py-2 text-xs text-safe">
          {fr
            ? `Vous aviez autorisé ${formatXaf(capXaf!)}. Le commerçant a facturé ${formatXaf(money.goodsXaf)} — vous payez ce montant, pas votre plafond.`
            : `You allowed ${formatXaf(capXaf!)}. The shop charged ${formatXaf(money.goodsXaf)} — you pay that, not your cap.`}
        </p>
      )}

      {money.needsCustomerApproval && (
        <p className="mt-2 rounded-xl bg-caution/10 px-3 py-2 text-xs text-caution">
          {fr
            ? `Le commerçant a facturé ${formatXaf(money.overCapByXaf)} de plus que votre plafond. Rien n'est dû tant que vous n'avez pas accepté.`
            : `The shop charged ${formatXaf(money.overCapByXaf)} more than your cap. Nothing is owed until you agree to it.`}
        </p>
      )}

      {goodsAtDoor && money.shopping && (
        <p className="mt-2 text-xs leading-relaxed text-mist-400">
          {fr
            ? "Vous payez les frais de livraison maintenant, et le montant exact des articles en espèces à l'arrivée — nous ne prenons jamais d'avance sur ce que nous n'avons pas encore dépensé."
            : "You pay the delivery fee now, and the exact cost of the items in cash on arrival — we never take money for something we haven't spent yet."}
        </p>
      )}

      {money.shopping && (
        <p className="mt-3 flex items-start gap-2 border-t border-ink-800 pt-3 text-xs leading-relaxed text-mist-400">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-safe" />
          {fr
            ? "Aucune marge sur vos articles : vous payez exactement ce que le commerçant nous a facturé, au franc près, et le livreur photographie le reçu. Nous ne gagnons que sur la livraison."
            : "No markup on your items: you pay exactly what the shop charged us, to the franc, and the rider photographs the receipt. We earn only on the delivery."}
        </p>
      )}
    </div>
  );
}

function Line({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className={cn("text-sm", muted ? "text-mist-400" : "text-mist-300")}>{label}</span>
      <span className={cn("shrink-0 text-sm font-medium", muted ? "text-mist-300" : "text-mist-100")}>
        {value}
      </span>
    </div>
  );
}
