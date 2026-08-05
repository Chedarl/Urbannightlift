import "server-only";

import { ATTENTION_MEANING, type AttentionRow } from "@/lib/orders/needsAttention";

/**
 * What a dispatcher's assistant is allowed to know about tonight.
 *
 * The customer assistant exists and is deliberately hidden on `/admin`: it is
 * grounded in one customer's own orders, so on a dispatcher's screen it would be
 * answering the wrong person out of the wrong data. This is the other one.
 *
 * The facts are the same rows the console already renders — the needs-attention
 * queue via the shared `needsAttention` module, unverified merchants, cases
 * waiting on us, who is on shift, and the recent AI failures. Nothing is
 * recomputed here, so the assistant cannot tell a dispatcher one thing while the
 * panel two inches above it says another.
 *
 * ## What is deliberately absent
 *
 * - **The delivery OTP.** Same rule as the customer side, for the same reason:
 *   it is never selected, so there is nothing to leak. A dispatcher who needs it
 *   has the order screen.
 * - **Payment credentials of any kind.** References and amounts are what staff
 *   verify against; a PIN or a secret code is never stored anywhere to begin
 *   with.
 * - **Prescription and parcel images.** They are not in this context and the
 *   model has no route to them.
 */

export interface StaffFacts {
  /** Who is asking, so the answer can address them and the log can name them. */
  staffName: string;
  role: string;
  hoursText: string;
  openNow: boolean;
  testMode: boolean;
  /** Tonight's shape, already counted by the console. */
  tonight: { orders: number; delivered: number; inProgress: number };
  attention: AttentionRow[];
  /** Businesses waiting on somebody to stand behind them. */
  unverifiedMerchants: { id: string; name: string; neighbourhood: string | null; daysWaiting: number }[];
  /** Businesses nobody has confirmed in a long time. */
  staleMerchants: { id: string; name: string; daysSinceConfirmed: number }[];
  /** Cases where the customer spoke last. */
  cases: { id: string; subject: string; customerName: string; hoursWaiting: number }[];
  /** Riders who are on shift right now, and how loaded they are. */
  riders: { id: string; name: string; online: boolean; activeOrders: number }[];
  /** Addresses that failed to resolve, most frequent first. */
  failingAddresses: { text: string; times: number }[];
  /** What the model itself has been failing at, in its own provider's words. */
  aiFailures: { purpose: string; error: string }[];
}

/**
 * The rules, in the order they matter.
 *
 * Shorter than the customer prompt on purpose. A dispatcher does not need to be
 * protected from a chatty model; they need a short true answer at 2 AM, and
 * every extra sentence here is one more thing for the model to hedge with.
 */
export function staffSystemPrompt(facts: StaffFacts): string {
  return `You are the Urban Night Lift operations assistant, helping the staff
who run a night delivery service in Yaoundé, Cameroon. You are talking to
${facts.staffName}, whose role is ${facts.role}.

Answer in English. Be brief and concrete: name the order, the business or the
person, and say what is actually wrong. Two or three sentences. This is read
between other jobs, usually after midnight.

WHAT YOU MUST NOT DO:
- Never invent an order, a business, a rider or a number. If it is not written
  below, you do not know it — say so.
- Never give out a delivery code. It is not in anything you have been given, and
  asking for it is a sign something is wrong.
- Never say an action has been taken. You propose a button; a person presses it,
  and their name goes on it, not yours.
- Never work out money. Every amount below was computed by the same code the
  receipt and the payable use. Quote it exactly or not at all.

WHAT YOU CAN OFFER
Alongside your answer you may propose up to three actions from this list and
nothing else: OPEN_ORDER, OPEN_MERCHANT, OPEN_CASE, OPEN_CUSTOMER (each with the
id shown below), VERIFY_MERCHANT (a merchant id), CONFIRM_TRADING (a merchant
id), ASSIGN_RIDER (an order id plus a riderId from the on-shift list),
RESOLVE_CASE (a case id). Give each a short button label. Every one of these runs
an existing screen's own endpoint under the pressing staff member's own
permissions — so propose freely, but never claim it is done.

TONIGHT
Hours: ${facts.hoursText}. We are ${facts.openNow ? "open" : "closed"} right now.${
    facts.testMode ? " Test mode is ON — orders tonight are rehearsals and are excluded from earnings." : ""
  }
${facts.tonight.orders} orders tonight: ${facts.tonight.inProgress} running, ${facts.tonight.delivered} delivered.

NEEDS ATTENTION (${facts.attention.length})
${
  facts.attention.length > 0
    ? facts.attention
        .map(
          (a) =>
            `- ${a.orderCode} (id ${a.id}), ${a.customerName}${
              a.riderName ? `, rider ${a.riderName}` : ", no rider"
            }: ${ATTENTION_MEANING[a.kind]} — waiting ${a.waitingMinutes} min`
        )
        .join("\n")
    : "Nothing is stuck."
}

RIDERS
${
  facts.riders.length > 0
    ? facts.riders
        .map((r) => `- ${r.name} (id ${r.id}): ${r.online ? "on shift" : "offline"}, ${r.activeOrders} active`)
        .join("\n")
    : "No riders on the books."
}

BUSINESSES WAITING TO BE VERIFIED (${facts.unverifiedMerchants.length})
${
  facts.unverifiedMerchants.length > 0
    ? facts.unverifiedMerchants
        .map(
          (m) =>
            `- ${m.name} (id ${m.id})${m.neighbourhood ? `, ${m.neighbourhood}` : ""} — waiting ${m.daysWaiting} days`
        )
        .join("\n")
    : "None."
}
${
  facts.staleMerchants.length > 0
    ? `\nNOT CONFIRMED IN A WHILE\n${facts.staleMerchants
        .map((m) => `- ${m.name} (id ${m.id}) — last confirmed ${m.daysSinceConfirmed} days ago`)
        .join("\n")}`
    : ""
}

CASES WAITING ON US (${facts.cases.length})
${
  facts.cases.length > 0
    ? facts.cases
        .map((c) => `- ${c.subject} (id ${c.id}), ${c.customerName} — waiting ${c.hoursWaiting}h`)
        .join("\n")
    : "None."
}
${
  facts.failingAddresses.length > 0
    ? `\nADDRESSES WE CANNOT FIND\n${facts.failingAddresses
        .map((a) => `- "${a.text}" — ${a.times} times`)
        .join("\n")}`
    : ""
}
${
  facts.aiFailures.length > 0
    ? `\nWHAT THE AI ITSELF HAS BEEN FAILING AT\n${facts.aiFailures
        .map((f) => `- ${f.purpose}: ${f.error}`)
        .join("\n")}`
    : ""
}`;
}

/** The shape the model must answer in — the same contract as the customer one. */
export const STAFF_ANSWER_SCHEMA = {
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
          riderId: { type: "string" },
          label: { type: "string" },
        },
      },
    },
  },
} as const;

export interface StaffAnswer {
  reply: string;
  actions?: unknown;
}
