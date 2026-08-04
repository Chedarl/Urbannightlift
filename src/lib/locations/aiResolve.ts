import "server-only";

import { prisma } from "@/lib/prisma";
import { kimiJson, kimiConfigured } from "@/lib/ai/kimi";
import { normalizeTokens } from "@/lib/locations/normalize";

/**
 * The one thing a model can do here that no map provider can.
 *
 * Addresses in Yaoundé are **directions, not addresses**: "derrière la station
 * Total à Rond-Point Express, portail bleu", "chez Mami Nga après le carrefour
 * Nsam". Google cannot geocode that and neither can OpenStreetMap — this was
 * checked before any of the mapping work was bought, and it is why the whole
 * address stack ranks our own catalogue above every third party.
 *
 * `scoreMatch` is a string comparison, so it fails on exactly the sentences that
 * matter: the words that identify the place ("station Total", "Rond-Point
 * Express") are buried among words that do not ("derrière", "portail bleu"), and
 * a customer's spelling rarely matches ours. Below a score of 30 the catalogue
 * step gives up and the address falls through to a bounded OSM guess at 0.5
 * confidence — a pin that may be a street away, which on a night delivery is a
 * failed first attempt and a rider ringing somebody at 1 AM.
 *
 * ## What this is allowed to do, and what it is not
 *
 * It **chooses among places we already know**. The candidate list is built here
 * and the model may only return one of those ids, so it cannot invent a
 * location, cannot move a pin, and cannot produce coordinates at all — the
 * coordinates come from our own row. The worst case is that it picks the wrong
 * one of our places, which is the same failure the fuzzy matcher already has and
 * is capped below.
 *
 * It also returns the **place words** it found — the landmark and the area —
 * which is useful even when it matches nothing: those are a far better query to
 * hand OpenStreetMap than the customer's whole sentence.
 *
 * Confidence is capped at 0.7 on purpose. Somewhere we have actually delivered
 * (0.9–0.99) and a strong catalogue hit must always win; this is a rescue for
 * addresses that were about to resolve badly or not at all.
 */

/** Above this, the plain catalogue matcher already had it. */
export const AI_CONFIDENCE_CAP = 0.7;

/**
 * How many catalogue rows to offer.
 *
 * The whole catalogue is tens of rows, not thousands, so this is mostly a cost
 * ceiling rather than a real filter — but it is ordered by token overlap so the
 * plausible ones are always present even if the list is trimmed.
 */
const MAX_CANDIDATES = 60;

export interface AiPlace {
  /** A `ServiceLocation.id` we supplied, or null when it recognised nothing. */
  locationId: string | null;
  confidence: number;
  /** The place words it picked out — "station Total", "Rond-Point Express". */
  landmark: string | null;
  area: string | null;
}

export interface Answer {
  matchedId: string;
  confidence: number;
  landmark?: string | null;
  area?: string | null;
}

const SCHEMA = {
  type: "object",
  required: ["matchedId", "confidence"],
  properties: {
    matchedId: { type: "string" },
    confidence: { type: "number" },
    landmark: { type: "string" },
    area: { type: "string" },
  },
} as const;

const SYSTEM = `You match delivery addresses in Yaoundé, Cameroon.

Addresses here are directions to a place, not postal lines. People say things
like "derrière la station Total à Rond-Point Express, portail bleu" or "after
the Nsam junction, opposite the pharmacy". Your job is to work out which of the
known places the customer means.

Rules you must follow:
- matchedId MUST be one of the ids given to you, or the empty string. Never
  invent an id, a place or coordinates.
- If you are not reasonably sure, return an empty matchedId. A wrong match sends
  a motorbike rider to the wrong door at 1 AM; no match simply means we ask.
- Ignore direction words (derrière, behind, après, en face, chez, vers) and
  descriptive detail (portail bleu, red gate) when deciding WHICH place it is —
  but do put the place words in landmark and area.
- French and English are both used, often in the same sentence, and spelling
  varies. "Total", "totale", "station total" are the same thing.
- confidence is 0 to 1, and describes how sure you are that this is the right
  known place.`;

/**
 * Narrows the catalogue to the rows worth showing the model, ordered by how
 * many meaningful words they share with what the customer typed.
 *
 * This is not the match — it is the shortlist. Ordering by overlap means that
 * even when the list is trimmed to `MAX_CANDIDATES`, anything the customer
 * plausibly meant is still in it.
 */
export function shortlist<T extends { primaryName: string; aliases: string[]; neighbourhood: string }>(
  text: string,
  rows: T[]
): T[] {
  const words = new Set(normalizeTokens(text).split(" ").filter((w) => w.length > 2));
  const scored = rows.map((row) => {
    const hay = normalizeTokens(
      `${row.primaryName} ${row.aliases.join(" ")} ${row.neighbourhood}`
    ).split(" ");
    let overlap = 0;
    for (const w of hay) if (words.has(w)) overlap += 1;
    return { row, overlap };
  });
  scored.sort((a, b) => b.overlap - a.overlap);
  return scored.slice(0, MAX_CANDIDATES).map((s) => s.row);
}

/**
 * Asks which known place the customer means. Returns null on anything at all
 * unexpected — no key, a refusal, a timeout, an id we did not offer.
 */
export async function aiMatchPlace(text: string): Promise<AiPlace | null> {
  if (!kimiConfigured()) return null;

  const rows = await prisma.serviceLocation
    .findMany({
      where: { active: true },
      select: {
        id: true,
        primaryName: true,
        aliases: true,
        neighbourhood: true,
        arrondissement: true,
        landmark: true,
      },
    })
    .catch(() => []);
  if (rows.length === 0) return null;

  const candidates = shortlist(text, rows);
  const known = new Set(candidates.map((c) => c.id));

  const list = candidates
    .map(
      (c) =>
        `${c.id} | ${c.primaryName}${c.aliases.length ? ` (also: ${c.aliases.join(", ")})` : ""} | ${c.neighbourhood}, ${c.arrondissement}${c.landmark ? ` | near ${c.landmark}` : ""}`
    )
    .join("\n");

  const answer = await kimiJson<Answer>({
    purpose: "address.match",
    system: SYSTEM,
    user: `The customer typed:\n"""${text}"""\n\nKnown places (id | name | area):\n${list}`,
    schema: SCHEMA as unknown as Record<string, unknown>,
  });
  // No key, a refusal, a timeout, a shape that did not validate — all the same
  // to the caller, which simply carries on to the next step.
  if (!answer) return null;

  return acceptAnswer(answer, known);
}

/**
 * The guard that makes the whole step safe, kept separate so it can be proven
 * without a network call.
 *
 * Two properties matter and both are checked here rather than trusted:
 *
 * **An id we never offered is thrown away.** A model that invents a plausible
 * cuid would otherwise send a lookup for a place that does not exist, or worse,
 * one that exists and is nowhere near. Only ids from the list we built survive.
 *
 * **Confidence is clamped, not reported.** A model claiming 0.99 on a landmark
 * address must never outrank somewhere a rider has actually delivered to, and
 * out-of-range or missing numbers become 0 rather than something arbitrary.
 */
export function acceptAnswer(answer: Answer, known: Set<string>): AiPlace {
  const matchedId = answer.matchedId?.trim() ?? "";

  return {
    locationId: matchedId && known.has(matchedId) ? matchedId : null,
    confidence: Number.isFinite(answer.confidence)
      ? Math.max(0, Math.min(AI_CONFIDENCE_CAP, answer.confidence))
      : 0,
    landmark: answer.landmark?.trim() || null,
    area: answer.area?.trim() || null,
  };
}
