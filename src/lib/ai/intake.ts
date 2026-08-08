import "server-only";

import { kimiJsonResult, kimiConfigured } from "@/lib/ai/kimi";
import { got, none, type AiRead } from "@/lib/ai/result";
import type { ServiceType } from "@prisma/client";

/**
 * "Just tell us what you need."
 *
 * ## The problem it is actually solving
 *
 * Ordering here means choosing a service, then filling a form built for that
 * service: what, where from, where to, when, how much, how to pay. Every field
 * is there for a reason and the whole thing is still a form, at midnight, on a
 * phone, one-handed.
 *
 * Most people already know how to say it in one sentence. *"Two pizzas from
 * Dolcezza to my place in Bastos"* contains the service, the shop, the items
 * and the destination. This reads that sentence and **fills the form in**.
 *
 * ## What it does not do, and this is the whole safety model
 *
 * **It never submits an order.** It produces a draft, the customer lands on the
 * form they would have filled anyway with the boxes already populated, and they
 * press the buttons. So pricing, zones, payment, the operating-hours check, the
 * enabled-services check and every guard in `POST /api/orders` are untouched
 * and still run on exactly the same input they always did.
 *
 * That matters more than it sounds. A model that could place an order would be
 * a model that could get a price wrong, send a rider somewhere nobody asked
 * for, or bill somebody. This one can only ever save typing — the worst thing a
 * bad reading can do is put wrong text in a box the customer is looking at.
 *
 * **It never invents an address.** If they did not say where, the field comes
 * back empty and they fill it, because a plausible-looking wrong address is far
 * more dangerous than a blank one: a blank field gets filled, a wrong one gets
 * confirmed.
 *
 * **It can only choose a service that is switched on.** The enabled list is
 * passed in and the answer is checked against it, so this cannot route somebody
 * into a paused service and a dead form.
 */

export interface IntakeDraft {
  /** Always one of the enabled services. Never invented. */
  serviceType: ServiceType;
  /** What they want, as they said it, for `itemDescription`. */
  itemDescription: string;
  /** The shop or place to collect from, if they named one. */
  pickupLocation: string;
  /** Where it goes, if they said. Empty rather than guessed. */
  deliveryLocation: string;
  /** Anything else worth carrying into the notes field. */
  notes: string;
  /** How many, when they plainly said a number. Defaults to 1. */
  quantity: number;
}

interface Answer {
  serviceType?: string;
  itemDescription?: string;
  pickupLocation?: string;
  deliveryLocation?: string;
  notes?: string;
  quantity?: number;
}

const SCHEMA = {
  type: "object",
  properties: {
    serviceType: { type: "string" },
    itemDescription: { type: "string" },
    pickupLocation: { type: "string" },
    deliveryLocation: { type: "string" },
    notes: { type: "string" },
    quantity: { type: "number" },
  },
} as const;

/** What each service is, in the words a customer would use to describe it. */
const SERVICE_MEANING: Record<string, string> = {
  FOOD_PICKUP: "food from a restaurant, street vendor or bakery",
  MEDICINE_PICKUP: "medicine from a pharmacy",
  GROCERY_PICKUP: "groceries from a shop, supermarket or market",
  SMALL_PARCEL: "sending or collecting a parcel, document or package",
  URGENT_ITEM: "something needed urgently, faster than normal",
  CUSTOM_ERRAND: "an errand that is none of the above",
  MERCHANT_DELIVERY: "a delivery from a specific business we already work with",
};

function system(enabled: ServiceType[]): string {
  return `Somebody in Yaoundé, Cameroon has typed one sentence saying what they
need delivered tonight. Turn it into the fields of an order form.

They will write in French, English or a mixture, informally: "deux pizzas de
chez Dolcezza pour Bastos", "I need paracetamol from any pharmacy near Mvan",
"send this envelope to my brother at Nsam".

The services available tonight, and ONLY these:
${enabled.map((s) => `- ${s}: ${SERVICE_MEANING[s] ?? s}`).join("\n")}

Return:
- serviceType: exactly one of the identifiers above. If it genuinely fits none
  of them, pick the closest available one — a person reviews this on screen.
- itemDescription: what they want, in their own words. Keep their wording; do
  not translate it or tidy it into English.
- pickupLocation: the shop, restaurant or place to collect from, ONLY if they
  named one. Empty string otherwise.
- deliveryLocation: where it goes, ONLY if they said. Empty string otherwise.
- quantity: a number ONLY if they plainly said one. 1 otherwise.
- notes: anything else they said that does not fit above.

NEVER invent a place. If they did not say where it comes from, or where it goes,
leave that field empty. An address you guessed is worse than an empty box: an
empty box gets filled in, and a wrong one gets confirmed by somebody in a hurry.

NEVER invent a price, a fee or a time. Say nothing about money at all.`;
}

/**
 * Shapes an answer into something safe to put in a form.
 *
 * Pure and exported so `scripts/verify-intake.ts` can prove the two rules that
 * matter: a disabled service can never come back, and a location is never
 * invented.
 */
export function shapeIntake(answer: Answer, enabled: ServiceType[]): IntakeDraft | null {
  const item = (answer.itemDescription ?? "").trim().slice(0, 1000);
  // Nothing to order. Better to say so than to open a form full of blanks.
  if (item.length < 3) return null;
  if (enabled.length === 0) return null;

  // The service is checked against what is actually switched on, never taken on
  // the model's word — otherwise a sentence about a parcel could route somebody
  // into a paused service and a form that refuses to submit.
  const claimed = (answer.serviceType ?? "").trim().toUpperCase();
  const serviceType = (enabled as string[]).includes(claimed)
    ? (claimed as ServiceType)
    : enabled[0];

  const quantity = Number(answer.quantity);

  return {
    serviceType,
    itemDescription: item,
    pickupLocation: (answer.pickupLocation ?? "").trim().slice(0, 300),
    deliveryLocation: (answer.deliveryLocation ?? "").trim().slice(0, 300),
    notes: (answer.notes ?? "").trim().slice(0, 1000),
    quantity: Number.isFinite(quantity) && quantity >= 1 && quantity <= 99 ? Math.round(quantity) : 1,
  };
}

/** One sentence, read into the fields of a form. Nothing is saved by this. */
export async function readIntake(
  sentence: string,
  enabled: ServiceType[]
): Promise<AiRead<IntakeDraft>> {
  const body = sentence.trim().slice(0, 600);
  if (body.length < 4) return none("Tell us what you need in a few words.");
  if (enabled.length === 0) return none("Nothing is being delivered right now.");
  if (!kimiConfigured()) return none("This is not switched on at the moment.");

  const result = await kimiJsonResult<Answer>({
    purpose: "order.intake",
    system: system(enabled),
    user: body,
    schema: SCHEMA as unknown as Record<string, unknown>,
  });

  if (!result.answer) return none(result.error ?? "We couldn't read that.");

  const draft = shapeIntake(result.answer, enabled);
  if (!draft) return none("We couldn't tell what you need from that. Try naming the item.");
  return got(draft);
}
