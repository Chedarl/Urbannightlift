/**
 * "Sell tonight" — a merchant's own sales intelligence, from our order data.
 *
 * This is the part no other delivery service here does. Everyone else moves a
 * merchant's goods and hands them a payout. We already know, per merchant,
 * which of their products actually sell, which nights are dead, and whether
 * their orders are growing or fading — because every order carries a
 * `merchantId` and structured `serviceDetails`. Turning that back into plain
 * advice makes us infrastructure for a small business rather than a courier.
 *
 * The rules that keep it honest, because bad advice is worse than none:
 *  - **Never invent a trend from nothing.** Below `MIN_ORDERS_FOR_ADVICE` we say
 *    we don't have enough yet. A "your sales are down 40%" built on 3 orders is
 *    noise that could make somebody change a menu for no reason.
 *  - **Only completed orders count.** A cancelled order is not a sale.
 *  - **Test orders never count.**
 *  - **We report what we can see, and say so.** We only observe what came
 *    through us, never their walk-in trade, so the copy says "through Urban
 *    Night Lift" rather than implying it is their whole business.
 */

/** Below this, we tell the merchant we don't have enough data yet. */
export const MIN_ORDERS_FOR_ADVICE = 8;
/** A change smaller than this is noise, not a trend. */
const TREND_THRESHOLD = 0.2;

export interface MerchantOrderFact {
  /** When it was placed. */
  createdAt: Date;
  /** Delivered/closed — an actual sale. */
  completed: boolean;
  isTest: boolean;
  /** Item lines, however the service records them. */
  items: { name: string; qty: number }[];
}

export type Trend = "GROWING" | "STEADY" | "FADING" | "UNKNOWN";

export interface ProductLine {
  name: string;
  units: number;
  /** Share of all units, 0–1. */
  share: number;
}

export interface SellTonight {
  /** Completed, non-test orders we can see. */
  orders: number;
  enoughData: boolean;
  trend: Trend;
  /** Best sellers, most units first. */
  top: ProductLine[];
  /** Nothing moved on these nights — where the opportunity is. */
  quietNights: string[];
  /** Plain-language lines to send the merchant. Empty when there's nothing honest to say. */
  advice: { en: string; fr: string }[];
}

const DAY_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/**
 * @param orders every order we hold for this merchant
 * @param now    reference time, so the split into "recent" and "before" is testable
 * @param windowDays length of each half of the comparison
 */
export function sellTonight(
  orders: MerchantOrderFact[],
  now: Date,
  windowDays = 14
): SellTonight {
  const real = orders.filter((o) => !o.isTest && o.completed);
  const count = real.length;
  const enoughData = count >= MIN_ORDERS_FOR_ADVICE;

  // Units per product, across everything we can see.
  const units = new Map<string, number>();
  for (const o of real) {
    for (const it of o.items) {
      const name = it.name.trim();
      if (!name) continue;
      units.set(name, (units.get(name) ?? 0) + Math.max(1, it.qty || 1));
    }
  }
  const totalUnits = [...units.values()].reduce((a, b) => a + b, 0);
  const top: ProductLine[] = [...units.entries()]
    .map(([name, u]) => ({ name, units: u, share: totalUnits > 0 ? u / totalUnits : 0 }))
    .sort((a, b) => b.units - a.units)
    .slice(0, 5);

  // Trend: the last window against the one before it.
  const msWindow = windowDays * 24 * 60 * 60 * 1000;
  const recentFrom = now.getTime() - msWindow;
  const priorFrom = recentFrom - msWindow;
  const recent = real.filter((o) => o.createdAt.getTime() >= recentFrom).length;
  const prior = real.filter(
    (o) => o.createdAt.getTime() >= priorFrom && o.createdAt.getTime() < recentFrom
  ).length;

  let trend: Trend = "UNKNOWN";
  if (enoughData && prior > 0) {
    const change = (recent - prior) / prior;
    trend = change > TREND_THRESHOLD ? "GROWING" : change < -TREND_THRESHOLD ? "FADING" : "STEADY";
  } else if (enoughData && prior === 0 && recent > 0) {
    trend = "GROWING";
  }

  // Which weekday never sells. Only meaningful with enough history.
  const byDay = new Array(7).fill(0) as number[];
  for (const o of real) byDay[o.createdAt.getDay()] += 1;
  const quietIdx = enoughData ? byDay.map((n, i) => ({ n, i })).filter((d) => d.n === 0) : [];
  const quietNights = quietIdx.map((d) => DAY_EN[d.i]);

  const advice: { en: string; fr: string }[] = [];
  if (!enoughData) {
    advice.push({
      en: `We've handled ${count} order${count === 1 ? "" : "s"} for you so far — a few more nights and we'll be able to show you what sells best.`,
      fr: `Nous avons traité ${count} commande${count === 1 ? "" : "s"} pour vous — encore quelques nuits et nous pourrons vous montrer ce qui vend le mieux.`,
    });
  } else {
    if (top[0]) {
      const pct = Math.round(top[0].share * 100);
      advice.push({
        en: `${top[0].name} is your best seller through Urban Night Lift — ${pct}% of everything we've delivered for you. Keep it ready at night.`,
        fr: `${top[0].name} est votre meilleure vente via Urban Night Lift — ${pct}% de tout ce que nous avons livré pour vous. Gardez-en de prêt la nuit.`,
      });
    }
    if (trend === "GROWING") {
      advice.push({
        en: `Your night orders are up: ${recent} in the last ${windowDays} days against ${prior} before that.`,
        fr: `Vos commandes de nuit augmentent : ${recent} sur les ${windowDays} derniers jours contre ${prior} avant.`,
      });
    }
    if (trend === "FADING") {
      advice.push({
        en: `Your night orders have slowed: ${recent} in the last ${windowDays} days against ${prior} before. Worth checking your prices and what's in stock after 10 PM.`,
        fr: `Vos commandes de nuit ralentissent : ${recent} sur les ${windowDays} derniers jours contre ${prior} avant. Vérifiez vos prix et vos stocks après 22h.`,
      });
    }
    if (quietNights.length > 0 && quietNights.length < 7) {
      advice.push({
        en: `Nothing sold on ${listEn(quietNights)}. That's open room — a small night offer could fill it.`,
        fr: `Rien de vendu ${listFr(quietIdx.map((d) => DAY_FR[d.i]))}. C'est de la place libre — une petite offre de nuit pourrait la remplir.`,
      });
    }
  }

  return { orders: count, enoughData, trend, top, quietNights, advice };
}

function listEn(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}
function listFr(items: string[]): string {
  if (items.length === 1) return `le ${items[0]}`;
  return `le ${items.slice(0, -1).join(", le ")} ni le ${items[items.length - 1]}`;
}
