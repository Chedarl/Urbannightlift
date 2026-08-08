import "server-only";

import { kimiJsonResult, kimiConfigured } from "@/lib/ai/kimi";
import { got, none, type AiRead } from "@/lib/ai/result";

/**
 * A first draft of a reply, for a person to edit and send.
 *
 * ## What it is for
 *
 * At 1 AM the support inbox is one person answering the same six questions in
 * two languages. The canned replies already cover the exactly-repeated ones.
 * What is left is the majority: a real question that needs a real answer, where
 * the slow part is not deciding *what* to say but typing it politely in
 * whichever language the customer wrote in.
 *
 * This writes that first version. Somebody reads it, fixes it, sends it.
 *
 * ## What makes it safe, and it is one rule
 *
 * **It never sends.** It fills the reply box, exactly like a canned reply does,
 * and the send button is the same button it always was. So what reaches a
 * customer is what a member of staff read and chose to send — and if the draft
 * is wrong, the cost is that somebody deletes it and types their own, which is
 * where they started.
 *
 * That is the whole difference between this and an auto-responder, and it is
 * why this is allowed to exist in a product where a wrong sentence about
 * somebody's money or somebody's medicine is a real harm.
 *
 * ## What it is allowed to know
 *
 * The case thread, the customer's name, and the status of their own orders.
 * Nothing else. In particular it never sees, because they are never selected
 * into the context:
 *
 *  - the delivery OTP — the same absolute rule as the customer assistant
 *  - anybody else's orders or cases
 *  - payment details beyond whether a payment was verified
 *
 * ## What it is told never to do
 *
 * Promise a time, promise a refund, or quote a figure. Those are commitments
 * the business makes, not sentences a model produces — and a draft that
 * casually promises money back is one a tired person will send at 2 AM.
 */

export interface CaseFacts {
  fr: boolean;
  /** Who they are, so the reply is addressed to a person. */
  customerName: string | null;
  /** What the case is about. */
  category: string;
  /** The thread so far, oldest first. */
  messages: { from: "customer" | "staff"; text: string }[];
  /**
   * Their own orders, already reduced to words. Never raw enums, and never a
   * figure the model could repeat as a promise.
   */
  orders: { orderCode: string; service: string; status: string; placedAt: string }[];
}

interface Answer {
  reply?: string;
}

const SCHEMA = {
  type: "object",
  required: ["reply"],
  properties: { reply: { type: "string" } },
} as const;

function system(facts: CaseFacts): string {
  return `You are drafting a reply for a member of staff at Urban Night Lift, a
night delivery service in Yaoundé, Cameroon. They will read what you write, fix
it, and decide whether to send it. You are not talking to the customer.

Write in ${facts.fr ? "French" : "English"}. Two to four sentences. Warm, plain,
and specific — this is read on a phone by somebody who already has a problem.

NEVER do any of these, and they are absolute:
- Never promise a delivery or arrival time. You do not know where the rider is.
- Never promise a refund, a discount, or any money. Only a person decides that.
- Never quote a price or a fee. If money is the question, say a colleague will
  confirm the exact figure.
- Never give out a delivery code or discuss one.
- Never invent a reason for what happened. If the thread does not say why
  something went wrong, say you are looking into it — do not guess and do not
  blame the rider, the restaurant or the customer.
- Never apologise on behalf of somebody who has not been shown to be at fault.

If the honest answer is that a person needs to look into this, write that. A
short reply saying "I am checking this now and will come back to you within the
hour" is a good reply, and far better than a confident wrong one.

WHO YOU ARE WRITING TO
${facts.customerName ? `Their name is ${facts.customerName}.` : "A customer."}
The case is about: ${facts.category}.

${
  facts.orders.length > 0
    ? `Their recent orders:\n${facts.orders
        .map((o) => `- ${o.orderCode}: ${o.service}, ${o.status}, placed ${o.placedAt}`)
        .join("\n")}`
    : "They have no recent orders on file."
}

THE CONVERSATION SO FAR
${facts.messages.map((m) => `${m.from === "customer" ? "Customer" : "Us"}: ${m.text}`).join("\n")}`;
}

/**
 * Reduces an answer to something safe to put in the reply box.
 *
 * Pure and exported so `scripts/verify-reply-draft.ts` can prove the bounds.
 * The interesting property is that there is no whitelist to enforce here — the
 * output is prose a person reads before it goes anywhere, so the guard is the
 * human, not the parser. What this does is stop an empty or runaway draft
 * reaching the box at all.
 */
export function shapeDraft(answer: Answer): string | null {
  const reply = (answer.reply ?? "").trim();
  // A draft too short to be a sentence wastes a click and teaches somebody to
  // stop pressing the button.
  if (reply.length < 15) return null;
  return reply.slice(0, 900);
}

/** A draft reply. Nothing is sent, and nothing is stored, by this. */
export async function draftReply(facts: CaseFacts): Promise<AiRead<string>> {
  if (!kimiConfigured()) return none("No Kimi key is configured.");
  if (facts.messages.length === 0) return none("There is nothing to reply to yet.");

  const result = await kimiJsonResult<Answer>({
    purpose: "support.draft",
    system: system(facts),
    // The last thing the customer said is the thing being answered. The rest of
    // the thread is context and sits in the system prompt.
    user:
      [...facts.messages].reverse().find((m) => m.from === "customer")?.text ??
      facts.messages[facts.messages.length - 1].text,
    schema: SCHEMA as unknown as Record<string, unknown>,
  });

  if (!result.answer) return none(result.error ?? "No draft came back.");

  const draft = shapeDraft(result.answer);
  if (!draft) return none("The draft came back empty.");
  return got(draft);
}
