import "server-only";

import { kimiJsonResult, kimiConfigured } from "@/lib/ai/kimi";
import { got, none, type AiRead } from "@/lib/ai/result";

/**
 * A second pair of eyes on what somebody asked us to carry.
 *
 * ## Being straight about what this is, and is not
 *
 * A model is not a security scanner and it is certainly not a judge. It does
 * not know Cameroonian law, it cannot tell a nurse ordering insulin from
 * somebody ordering insulin for a bad reason, and it will be confidently wrong
 * about slang it has never met. Anyone who builds this as a gate is building a
 * machine that refuses real orders.
 *
 * So it is not a gate. **It flags, and a dispatcher looks.**
 *
 * ```
 * order created ──▶ always succeeds ──▶ flag written, maybe
 *                                          │
 *                                          ▼
 *                              needs-attention panel, for a human
 * ```
 *
 * ## Why flagging beats refusing, concretely
 *
 * At 1 AM the cost of the two mistakes is wildly asymmetric. A flagged order
 * that turns out to be fine costs a dispatcher three seconds of reading. A
 * refused order that was fine costs a customer their medicine and costs us the
 * customer — and they will never know why, because a refusal cannot explain
 * itself without teaching somebody how to word it differently next time.
 *
 * The riders are the other half of it. This exists so that nobody is sent to
 * collect something they should not be carrying, without a rider having to work
 * that out alone in the dark at somebody's gate.
 *
 * ## What it looks at, and what it does not
 *
 * Only the **free text a customer typed**: what they want, and the note they
 * left. Never their name, their number, their address or their order history.
 * Judging a person rather than a request is how this kind of thing becomes
 * discrimination with a computer in front of it.
 */

/** What came back, before we decide whether it is worth anybody's time. */
interface Verdict {
  /** Whether anything about the request is worth a human glance. */
  concern?: boolean;
  /** Which of the fixed categories, so the panel can be consistent. */
  category?: string;
  /** One sentence, for a dispatcher, in English. */
  reason?: string;
}

const SCHEMA = {
  type: "object",
  properties: {
    concern: { type: "boolean" },
    category: { type: "string" },
    reason: { type: "string" },
  },
} as const;

/**
 * The categories a flag may carry.
 *
 * A fixed list rather than free text, so the panel reads consistently and so a
 * model cannot invent a category that sounds alarming and means nothing.
 */
const CATEGORIES = ["WEAPON", "DRUG", "STOLEN", "LIVE_ANIMAL", "HAZARD", "PERSON_AT_RISK", "OTHER"] as const;
export type SafetyCategory = (typeof CATEGORIES)[number];

const SYSTEM = `You are helping a night delivery service in Yaoundé, Cameroon
decide whether a request needs a human to look at it before a rider is sent.

You are NOT deciding whether to accept the order. A person does that. You are
only saying whether something here is worth thirty seconds of their attention.

Flag it (concern: true) only for:
- WEAPON: firearms, ammunition, blades presented as weapons.
- DRUG: illegal drugs, or prescription medicines being sought without a
  prescription in a way the text makes explicit.
- STOLEN: the text itself suggests the goods are stolen.
- LIVE_ANIMAL: a live animal to be carried on a motorbike at night.
- HAZARD: fuel, gas cylinders, corrosives, fireworks, anything that could hurt
  a rider carrying it on a bike.
- PERSON_AT_RISK: the text suggests somebody is in danger, hurt, or in a medical
  emergency. This one is not about the goods — it is about somebody needing help
  faster than a delivery.

Do NOT flag:
- ordinary medicine, including prescription medicine ordered normally. This
  service delivers from pharmacies; that is the entire point.
- alcohol, cigarettes, or anything else legal to sell at night.
- kitchen knives, tools, or machetes described as tools. This is Cameroon and a
  machete is farm equipment.
- money, phones, laptops or documents. Valuable is not suspicious.
- anything you simply do not recognise. An unfamiliar dish, brand or slang word
  is not a reason to flag, and treating it as one would flag half of every real
  night's orders.

If you are unsure, do not flag. A false alarm every night trains people to
ignore the panel, which is worse than not having it.

Answer with concern false and nothing else when there is no concern.`;

export interface SafetyReading {
  category: SafetyCategory;
  /** One sentence a dispatcher reads. Never shown to the customer. */
  reason: string;
}

/**
 * Reduces a model answer to a flag we are willing to raise.
 *
 * Pure and exported so `scripts/verify-moderation.ts` can prove the part that
 * decides — particularly that a missing or unrecognised category cannot become
 * an alarming-sounding label, and that "no concern" survives a model that
 * padded its answer with a reason anyway.
 */
export function shapeVerdict(verdict: Verdict): SafetyReading | null {
  if (verdict.concern !== true) return null;

  const reason = (verdict.reason ?? "").trim().slice(0, 200);
  // A flag with nothing to read is worse than no flag: it puts a mark on an
  // order and tells the dispatcher nothing about why.
  if (reason.length < 8) return null;

  const raw = (verdict.category ?? "").trim().toUpperCase();
  const category = (CATEGORIES as readonly string[]).includes(raw)
    ? (raw as SafetyCategory)
    : "OTHER";

  return { category, reason };
}

/**
 * Screens the free text on an order.
 *
 * Returns null when there is nothing to say, which is the overwhelmingly common
 * case and must stay cheap and silent.
 */
export async function screenOrderText(text: string): Promise<AiRead<SafetyReading | null>> {
  const body = text.trim().slice(0, 1200);
  // Nothing typed, nothing to read. Most orders built from the catalogue and
  // the item builder land here, so this is the fast path.
  if (body.length < 4) return got(null);
  if (!kimiConfigured()) return none("No Kimi key is configured.");

  const result = await kimiJsonResult<Verdict>({
    purpose: "order.safety",
    system: SYSTEM,
    user: body,
    schema: SCHEMA as unknown as Record<string, unknown>,
  });

  if (!result.answer) return none(result.error ?? "No answer came back.");
  return got(shapeVerdict(result.answer));
}

/** The words the panel shows for each category. */
export const SAFETY_LABEL: Record<SafetyCategory, string> = {
  WEAPON: "Possible weapon",
  DRUG: "Possible controlled substance",
  STOLEN: "Possibly stolen goods",
  LIVE_ANIMAL: "Live animal",
  HAZARD: "Hazardous to carry",
  PERSON_AT_RISK: "Somebody may need help",
  OTHER: "Worth a look",
};
