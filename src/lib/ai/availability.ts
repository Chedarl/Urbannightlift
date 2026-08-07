import "server-only";

import { kimiJsonResult, kimiConfigured } from "@/lib/ai/kimi";
import { scoreMatch, normalizeLoose } from "@/lib/locations/normalize";

/**
 * Turning *"plus de poisson braisé, il reste poulet DG et attiéké"* into a
 * catalogue that is true right now.
 *
 * ## Why this is the feature
 *
 * Everywhere else in this market you order a dish, wait forty minutes, and find
 * out it ran out before the rider got there. The restaurant always knew. Nobody
 * ever asked them, because asking is a phone call and a phone call does not
 * scale past about four merchants a night.
 *
 * A ping does scale. The answer comes back as a sentence in whatever mixture of
 * French, English and Camfranglais the person happens to type, at 11 PM, on a
 * phone, one-handed, next to a fire. That is precisely the input a model is good
 * at and a form is bad at — so the model reads the sentence and a person never
 * has to translate it into ticks.
 *
 * ## The rule that keeps it honest
 *
 * **A name we cannot match is never invented as a product.** The model returns
 * words; those words are matched against *this merchant's own* items with the
 * same `scoreMatch` the location search uses, and anything that does not match
 * comes back as `unmatched` for a human to look at. A restaurant saying "we have
 * ndolé" when ndolé is not on their menu is a menu question, not a stock
 * question, and answering it automatically would put a dish in front of a
 * customer at a price nobody ever set.
 *
 * ## And the loop that rule accidentally closed
 *
 * That rule was right and its implementation was a trap. Asking was **refused
 * outright** for a merchant with nothing listed — no items, nothing to mark, so
 * why ask. But the way you get items is to ask, so a newly verified business
 * sat at a dead end: a card on the food page with no menu, and the one feature
 * that could have filled it switched off precisely because it was empty. That
 * is why "ask what they have" and "add their menu" were reported as broken
 * together; they are the same loop with no entry point.
 *
 * So an unmatched name is still never created — it is now *offered*. The
 * reading carries `newItems`: names the merchant said, with a price where they
 * gave one, for a person to tick into the catalogue. On a merchant's own page
 * they go straight in, because it is their shop and their price.
 *
 * One WhatsApp reply now turns an empty verified merchant into a menu, which is
 * the fastest catalogue-filling route in the product and needs no photograph.
 *
 * ## Two ways in, one parser
 *
 * A `wa.me` ping cannot receive a reply — it opens WhatsApp with the message
 * typed and the answer lands in the owner's phone. So the reply gets here either
 * because staff pasted it, or because the merchant tapped a signed link and
 * typed it themselves. Both land in `readAvailability`, so there is one place
 * where a sentence becomes a change and one place to get it right.
 */

/** A product this merchant actually has on their list. */
export interface CatalogueItem {
  id: string;
  name: string;
  nameFr: string | null;
}

export interface AvailabilityAnswer {
  soldOut?: string[];
  available?: string[];
  /**
   * Dishes they named **with a price** — "gâteau chocolat 5000, croissant 500".
   *
   * This is what a first reply looks like, when we asked what they sell rather
   * than what ran out. Kept separate from `available` because a price is the
   * part that turns a name into something orderable.
   */
  priced?: { name?: string; priceXaf?: number }[];
  /** Anything they said that is not about a specific dish — "we close at 1am". */
  note?: string | null;
  /** They said everything is on. Saves them listing twenty items. */
  allAvailable?: boolean;
}

const SCHEMA = {
  type: "object",
  properties: {
    soldOut: { type: "array", items: { type: "string" } },
    available: { type: "array", items: { type: "string" } },
    priced: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, priceXaf: { type: "number" } },
      },
    },
    note: { type: "string" },
    allAvailable: { type: "boolean" },
  },
} as const;

/**
 * Deliberately short, and deliberately about *listening* rather than deciding.
 *
 * The model's only job is to say which dish names were mentioned and in which
 * direction. It never decides what exists — the matching below does that, from
 * the merchant's own list.
 */
function system(items: CatalogueItem[]): string {
  // Nothing listed yet: this reply is their menu, not a stock update. Asking
  // "which of these ran out" of a business with no list is the dead end that
  // made both halves of this feature unreachable.
  if (items.length === 0) {
    return `A restaurant in Yaoundé, Cameroon has been asked what they sell and
for how much. Read their reply.

They will answer in French, English or a mix, informally, often as a list:
"gâteau chocolat 5000, croissant 500", "on a poulet DG 3500 et attiéké poisson
4000", "cakes from 2000".

Return:
- priced: every dish or item they named, with its price in XAF as a plain
  number when they gave one. Leave the price out when they did not — do not
  guess it, do not convert it, and do not average a range.
- note: anything else worth a person seeing — a closing time, a minimum order,
  a problem. One short sentence.

Use their own words for the names. Add nothing they did not say: a dish they
did not mention is not a dish they sell. If the reply is not about what they
sell at all, return nothing but a note saying so.`;
  }

  return `A restaurant in Yaoundé, Cameroon has been asked what food they have
available right now. Read their reply.

They will answer in French, English or a mix, informally, often very short:
"plus de poisson", "on a tout", "il reste que du poulet DG", "no more fish
tonight", "tout est dispo sauf le braisé".

Their menu is:
${items.map((i) => `- ${i.name}${i.nameFr && i.nameFr !== i.name ? ` (${i.nameFr})` : ""}`).join("\n")}

Return:
- soldOut: the dishes they say are finished, out, or unavailable.
- available: the dishes they say they still have.
- allAvailable: true ONLY if they plainly say everything is available.
- priced: any dish they name that is NOT on the menu above, with its price in
  XAF when they gave one. A restaurant adding something is normal; we simply do
  not put it in front of a customer until a person has looked at it.
- note: anything else worth a person seeing — a closing time, a new dish, a
  problem. One short sentence.

Use the dish names as written in the menu above wherever you can. Say nothing
about a dish they did not mention: a dish nobody mentioned is not a dish that
ran out. If the reply is not about food availability at all, return nothing but
a note saying so.`;
}

export interface AvailabilityChange {
  itemId: string;
  name: string;
  soldOut: boolean;
}

/** A dish they named that we do not sell yet. Offered, never created. */
export interface NewItem {
  name: string;
  /** Only when they actually said one. Never guessed, never averaged. */
  priceXaf: number | null;
}

export interface AvailabilityReading {
  changes: AvailabilityChange[];
  /** Names they used that are not on this merchant's list. Never auto-created. */
  unmatched: string[];
  /**
   * The same names, shaped to be added — with a price where they gave one.
   *
   * This is what turns a first reply into a menu. Still nothing is written by
   * reading: staff tick these, and on a merchant's own page they go in directly
   * because it is their shop and their price.
   */
  newItems: NewItem[];
  note: string | null;
  allAvailable: boolean;
  error: string | null;
}

/** A price we are willing to repeat back. Anything odd becomes "ask them". */
function cleanPrice(raw: unknown): number | null {
  const n = Number(raw);
  // No negatives, no zero, no fractions of a franc, and nothing absurd — a
  // model that has misread "5.000" as five must not put a 5 XAF cake on a menu.
  if (!Number.isFinite(n) || n < 50 || n > 10_000_000) return null;
  return Math.round(n);
}

/**
 * How close a name has to be before it is the same dish.
 *
 * Tuned deliberately high. Marking the wrong dish sold out costs a merchant
 * orders they could have taken; leaving a name unmatched costs one glance at a
 * list. The cheaper mistake is the one to make.
 */
const MATCH_THRESHOLD = 62;

/**
 * Matches what they said to what they sell.
 *
 * Exported and pure so `scripts/verify-availability.ts` can prove the part that
 * actually decides — the model's output is just words, and this is where words
 * become a change to a customer's screen.
 */
export function matchItems(
  spoken: string[],
  items: CatalogueItem[]
): { matched: { item: CatalogueItem; said: string }[]; unmatched: string[] } {
  const matched: { item: CatalogueItem; said: string }[] = [];
  const unmatched: string[] = [];

  for (const raw of spoken) {
    const said = (raw ?? "").trim();
    if (said.length < 2) continue;

    let best: { item: CatalogueItem; score: number } | null = null;
    for (const item of items) {
      // Both names are candidates, because a merchant answering in French will
      // name the French one and the catalogue may carry either as primary.
      const aliases = item.nameFr && item.nameFr !== item.name ? [item.nameFr] : [];
      const score = scoreMatch(said, item.name, aliases);
      if (!best || score > best.score) best = { item, score };
    }

    if (best && best.score >= MATCH_THRESHOLD) {
      // The same dish named twice in one reply is one change, not two.
      if (!matched.some((m) => m.item.id === best!.item.id)) matched.push({ item: best.item, said });
    } else if (!unmatched.some((u) => normalizeLoose(u) === normalizeLoose(said))) {
      unmatched.push(said.slice(0, 60));
    }
  }

  return { matched, unmatched };
}

/**
 * Reduces a model answer to the changes we are willing to make.
 *
 * Pure, for the same reason `shapeDraft` is: this is the layer that decides what
 * reaches a customer's screen, and it should be provable rather than trusted.
 */
export function shapeReading(answer: AvailabilityAnswer, items: CatalogueItem[]): AvailabilityReading {
  const soldOut = matchItems(answer.soldOut ?? [], items);
  const available = matchItems(answer.available ?? [], items);

  const changes: AvailabilityChange[] = [];
  const seen = new Set<string>();

  // Sold-out first. If a confused reply names the same dish both ways, the safe
  // reading is that it is off: a customer who cannot order something we have is
  // mildly disappointed, and one who orders something we do not have has been
  // let down at 1 AM by a business that promised it.
  for (const { item } of soldOut.matched) {
    changes.push({ itemId: item.id, name: item.name, soldOut: true });
    seen.add(item.id);
  }
  for (const { item } of available.matched) {
    if (seen.has(item.id)) continue;
    changes.push({ itemId: item.id, name: item.name, soldOut: false });
    seen.add(item.id);
  }

  // "We have everything" turns every item they did not mention back on. It is
  // the most common answer and the one nobody wants to type out item by item.
  if (answer.allAvailable === true) {
    for (const item of items) {
      if (seen.has(item.id)) continue;
      changes.push({ itemId: item.id, name: item.name, soldOut: false });
      seen.add(item.id);
    }
  }

  /*
   * Everything they named that we do not sell, gathered into something a person
   * can tick. Two sources: bare names pulled out of a stock reply, and the
   * priced list a first reply produces. A name in both appears once, and the
   * priced version wins because a price is the useful half.
   */
  const priced = Array.isArray(answer.priced) ? answer.priced : [];
  const newItems: NewItem[] = [];
  const claimed = new Set<string>();

  function offer(rawName: unknown, rawPrice: unknown) {
    const name = typeof rawName === "string" ? rawName.trim().slice(0, 60) : "";
    if (name.length < 2) return;
    const key = normalizeLoose(name);
    if (!key || claimed.has(key)) return;
    // Something they named that we already stock is a stock change, which the
    // matching above has already handled. It is not a new item.
    if (matchItems([name], items).matched.length > 0) return;
    claimed.add(key);
    newItems.push({ name, priceXaf: cleanPrice(rawPrice) });
  }

  for (const row of priced) offer(row?.name, row?.priceXaf);
  for (const said of [...soldOut.unmatched, ...available.unmatched]) offer(said, null);

  return {
    changes,
    unmatched: [...new Set([...soldOut.unmatched, ...available.unmatched])].slice(0, 10),
    // Bounded: one reply should not be able to propose a hundred rows for
    // somebody to read at 1 AM.
    newItems: newItems.slice(0, 20),
    note: answer.note?.trim().slice(0, 200) || null,
    allAvailable: answer.allAvailable === true,
    error: null,
  };
}

/** A reply, read into a set of changes. Nothing here writes anything. */
export async function readAvailability(
  replyText: string,
  items: CatalogueItem[]
): Promise<AvailabilityReading> {
  const empty: AvailabilityReading = {
    changes: [],
    unmatched: [],
    newItems: [],
    note: null,
    allAvailable: false,
    error: null,
  };

  const body = replyText.trim().slice(0, 1500);
  if (body.length < 2) return { ...empty, error: "There is nothing to read." };
  // An empty list used to be refused here. That was the dead end: the only way
  // to get a list is to ask, so refusing to ask kept every new merchant empty
  // forever. With nothing listed the reply is read as a menu instead.
  if (!kimiConfigured()) return { ...empty, error: "No Kimi key is configured." };

  const result = await kimiJsonResult<AvailabilityAnswer>({
    purpose: "merchant.availability",
    system: system(items),
    user: body,
    schema: SCHEMA as unknown as Record<string, unknown>,
  });

  if (!result.answer) return { ...empty, error: result.error ?? "No answer came back." };
  return shapeReading(result.answer, items);
}
