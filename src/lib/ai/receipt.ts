import "server-only";

import { kimiJsonResult, kimiConfigured } from "@/lib/ai/kimi";
import { readImage } from "@/lib/ai/images";
import { got, none, type AiRead } from "@/lib/ai/result";

/**
 * Reading the shop receipt the rider photographed.
 *
 * The photo has been taken and stored since the goods work shipped and **read
 * by nobody** — it was not rendered on any screen, and the media route did not
 * even allow its bucket. So the strongest trust device in the shopping flow
 * ("the receipt proves we charged you what the shop charged") existed as a file
 * and not as anything a person could see.
 *
 * This gives it a second reader. Not to replace the rider — to agree with them.
 * A receipt that has been read and matches is what makes an accusation against
 * a rider impossible, which matters more to the rider than to us.
 *
 * It extracts and stops. It cannot change `goodsActualXaf`, cannot re-price an
 * order and cannot flag anything by itself; a disagreement becomes a question
 * for a dispatcher and nothing else.
 */

export interface ReceiptReading {
  /** The total the receipt appears to show, in XAF. */
  totalXaf: number | null;
  items: { name: string; priceXaf: number | null }[];
  /** What the model thought the shop was called, if it was printed. */
  shopName: string | null;
}

interface Answer {
  totalXaf: number;
  items?: { name: string; priceXaf?: number | null }[];
  shopName?: string | null;
  readable?: boolean;
}

const SCHEMA = {
  type: "object",
  required: ["totalXaf"],
  properties: {
    totalXaf: { type: "number" },
    readable: { type: "boolean" },
    shopName: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" }, priceXaf: { type: "number" } },
      },
    },
  },
} as const;

const SYSTEM = `You read shop receipts from Cameroon and report what is printed.

Amounts are in XAF (FCFA). They are written many ways — 4 500, 4.500, 4,500,
"4500 F", "4500 FCFA" — and all of those mean four thousand five hundred.
Return plain integers with no separators.

Rules:
- totalXaf is the FINAL TOTAL the customer paid. Not a subtotal, not one line.
- If the total is not legible, set readable to false and totalXaf to 0. Do not
  guess and do not add up the lines to invent a total — somebody is checking a
  rider's honesty against this number, and a guess is worse than nothing.
- Only report lines you can actually read. An empty items list is a fine answer.
- Do not convert currencies. Do not round.`;

/**
 * Reads one receipt image, or returns null.
 *
 * Null covers every uninteresting case identically — no key, an unreadable
 * photo, a timeout, a bucket we are not allowed to read — because the caller
 * does the same thing in all of them: records that it could not be checked, and
 * carries on.
 */
export async function readReceipt(
  receiptPath: string | null,
  orderId?: string
): Promise<AiRead<ReceiptReading>> {
  if (!kimiConfigured()) return none("No Kimi key is configured.");

  const image = await readImage(receiptPath);
  if (!image.dataUrl) return none(image.problem ?? "Couldn't read that file.");

  const result = await kimiJsonResult<Answer>({
    purpose: "receipt.read",
    system: SYSTEM,
    user: "Read this shop receipt and report the final total and the lines you can make out.",
    images: [image.dataUrl],
    schema: SCHEMA as unknown as Record<string, unknown>,
    entityType: "order",
    entityId: orderId,
  });

  const answer = result.answer;
  if (!answer) return none(result.error ?? "No answer came back.");

  // `readable: false` is the model doing what it was asked — saying it could not
  // read the total rather than inventing one. Treated as no reading at all.
  if (answer.readable === false || !Number.isFinite(answer.totalXaf) || answer.totalXaf <= 0) {
    return none("Couldn't make the total out on that receipt.");
  }

  return got({
    totalXaf: Math.round(answer.totalXaf),
    shopName: answer.shopName?.trim() || null,
    items: (answer.items ?? [])
      .filter((i) => i?.name?.trim())
      .slice(0, 30)
      .map((i) => ({
        name: i.name.trim().slice(0, 80),
        priceXaf:
          typeof i.priceXaf === "number" && Number.isFinite(i.priceXaf) && i.priceXaf > 0
            ? Math.round(i.priceXaf)
            : null,
      })),
  });
}
