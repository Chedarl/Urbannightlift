import "server-only";

import { formatXaf } from "@/lib/utils";
import type { Action } from "@/lib/ai/assistant/actions";

/**
 * Everything the assistant is allowed to know, assembled by us.
 *
 * The safety of a customer-facing model is not mostly in its prompt. It is in
 * what you put in front of it. A rule like "never reveal the delivery code" is a
 * request; **not putting the delivery code in the context is a fact.** This
 * module is where that distinction lives, and it is why it is pure and proved
 * rather than assembled inline in a route.
 *
 * ## Three audiences, three different worlds
 *
 * | Asking | Can reach |
 * |---|---|
 * | A stranger on the public site | services, tonight's hours, zones and fees, what is open |
 * | A signed-in customer | the above, plus **their own** orders and saved places |
 * | Someone watching a delivery | the above, plus that order's public status |
 *
 * The signed-out world contains **no order data at all** — not masked, not
 * filtered, absent. The owner chose to put this on the public site, and a chat
 * box a stranger can type an order code into is exactly where a filter would
 * eventually be got round. There is nothing to get round if it was never loaded.
 *
 * ## What it must never carry, and does not
 *
 * - **The delivery OTP.** Never selected, never passed, in any of the three
 *   worlds. It is the one secret standing between a stranger and somebody's
 *   parcel at 1 AM.
 * - **Anybody else's anything.** Every order and address here is loaded by the
 *   caller from the session, so there is no query the model can influence.
 * - **A price it worked out itself.** Fees are computed by `estimateDeliveryFee`
 *   and handed over as text to quote. The model is told to repeat them and never
 *   to calculate, because a chatbot that does mental arithmetic about money will
 *   eventually do it wrong to somebody who believed it.
 */

export interface OrderSummary {
  orderCode: string;
  service: string;
  status: string;
  placedAt: string;
  /** What they were told they would pay. Never recomputed here. */
  totalText: string | null;
}

export interface SavedPlace {
  id: string;
  label: string;
}

export interface AssistantFacts {
  fr: boolean;
  signedIn: boolean;
  firstName: string | null;
  /** Trading window, as words, from the live settings. */
  hoursText: string;
  openNow: boolean;
  /** Enabled services, as the labels a customer would recognise. */
  services: { type: string; label: string }[];
  /** Zone name → fee, already formatted. The model quotes; it never adds up. */
  fees: { zone: string; feeText: string }[];
  /** Empty for a stranger. Not filtered — never loaded. */
  orders: OrderSummary[];
  places: SavedPlace[];
  /** Businesses trading right now, so "what's open" has a real answer. */
  openMerchants: { name: string; category: string; neighbourhood: string | null }[];
}

/**
 * The rules, in the order they matter.
 *
 * Written as plain sentences rather than a specification because that is what a
 * model follows best — and every one of them is also enforced in code
 * somewhere, because a prompt is a request and a guard is a promise.
 */
export function systemPrompt(facts: AssistantFacts): string {
  return `You are the Urban Night Lift assistant. Urban Night Lift delivers at
night in Yaoundé, Cameroon — food, medicine, groceries and parcels — for people
who have no time to run errands, and for small businesses reaching their
customers.

Answer in ${facts.fr ? "French" : "English"}. Be brief: two or three sentences.
This is read on a phone, often after midnight, often by somebody who wants one
fact and not a paragraph.

WHAT YOU MUST NOT DO, and these are absolute:
- Never invent an arrival time. You do not know where the rider is unless it is
  written below. If asked, say you cannot promise a time and offer a person.
- Never invent a price, a fee or a discount. Quote only the amounts written
  below, exactly as they are written. Do not add, convert or estimate.
- Never give out a delivery code, and never help anybody get one. It is how a
  customer proves the goods reached the right hands.
- Never discuss anybody's order but the one asking. If an order code is not in
  the list below, you do not know anything about it — say so plainly.
- Never promise that we will do something. You can explain what we do; a person
  decides what we will do.
- If you are not sure, say you are not sure and offer to pass it to a person.
  That is a good answer here, not a failure.

WHAT YOU CAN OFFER
Alongside your answer you may propose up to three actions from this list, and
nothing else: TRACK_ORDER (with one of their order codes), REORDER (same),
DELIVER_TO_SAVED (with one of their saved place ids), START_SERVICE (with one of
the service types below), OPEN_CASE (to reach a person), SHOW_OPEN_NOW.
Give each a short button label in the language you are answering in. You are
suggesting a button, not doing anything — the customer taps it.

WHAT IS TRUE RIGHT NOW
Hours: ${facts.hoursText}. We are ${facts.openNow ? "open" : "closed"} at this moment.
Services on tonight: ${facts.services.map((s) => `${s.label} (${s.type})`).join(", ") || "none"}.
Delivery fees by zone: ${facts.fees.map((f) => `${f.zone} ${f.feeText}`).join(", ") || "not published"}.
${
  facts.openMerchants.length > 0
    ? `Open now: ${facts.openMerchants
        .map((m) => `${m.name}${m.neighbourhood ? ` (${m.neighbourhood})` : ""}`)
        .join(", ")}.`
    : "No businesses are confirmed open at this moment."
}

${
  facts.signedIn
    ? `WHO YOU ARE TALKING TO
${facts.firstName ? `Their name is ${facts.firstName}.` : "A signed-in customer."}
${
  facts.orders.length > 0
    ? `Their recent orders:\n${facts.orders
        .map(
          (o) =>
            `- ${o.orderCode}: ${o.service}, ${o.status}, placed ${o.placedAt}${
              o.totalText ? `, ${o.totalText}` : ""
            }`
        )
        .join("\n")}`
    : "They have not ordered yet."
}
${
  facts.places.length > 0
    ? `Their saved places: ${facts.places.map((p) => `${p.label} (${p.id})`).join(", ")}.`
    : "They have no saved places."
}`
    : `WHO YOU ARE TALKING TO
Somebody who is not signed in. You have no access to any order, any address or
any account, and you must not pretend otherwise. If they ask about an order,
tell them to sign in or use the tracking page with their code and phone number.`
}`;
}

/** The shape the model must answer in. */
export const ANSWER_SCHEMA = {
  type: "object",
  required: ["reply"],
  properties: {
    reply: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        required: ["kind", "label"],
        properties: {
          kind: { type: "string" },
          ref: { type: "string" },
          label: { type: "string" },
        },
      },
    },
  },
} as const;

export interface AssistantAnswer {
  reply: string;
  actions?: unknown;
}

/** What the caller sends back to the browser. */
export interface AssistantReply {
  reply: string;
  actions: Action[];
}

/** A money figure the model is allowed to repeat, already formatted by us. */
export function feeText(feeXaf: number): string {
  return formatXaf(feeXaf);
}
