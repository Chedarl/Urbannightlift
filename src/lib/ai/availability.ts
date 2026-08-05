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

export interface AvailabilityReading {
  changes: AvailabilityChange[];
  /** Names they used that are not on this merchant's list. Never auto-created. */
  unmatched: string[];
  note: string | null;
  allAvailable: boolean;
  error: string | null;
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

  return {
    changes,
    unmatched: [...new Set([...soldOut.unmatched, ...available.unmatched])].slice(0, 10),
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
    note: null,
    allAvailable: false,
    error: null,
  };

  const body = replyText.trim().slice(0, 1500);
  if (body.length < 2) return { ...empty, error: "There is nothing to read." };
  if (items.length === 0) {
    return {
      ...empty,
      error: "This business has no items on its list yet, so there is nothing to mark available.",
    };
  }
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
