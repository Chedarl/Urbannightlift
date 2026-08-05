import "server-only";

import { prisma } from "@/lib/prisma";
import type { AvailabilityChange } from "@/lib/ai/availability";

/**
 * The one place a reading becomes a change to what customers can order.
 *
 * Both answer paths — staff pasting a WhatsApp reply, and the merchant tapping
 * the link and typing it themselves — end here, so there is a single place where
 * a sentence turns into a sold-out badge, and a single place to get the
 * bookkeeping right.
 *
 * Two things are recorded rather than assumed:
 *
 *  - **`soldOutAt`, not just `available: false`.** The merchant's standing menu
 *    and tonight's stock are different facts. "We do not sell this" should
 *    survive; "we are out tonight" should clear itself the next time they say
 *    otherwise.
 *  - **`availabilityCheckedAt` on the merchant**, which is what the customer
 *    actually sees: *"confirmed 12 minutes ago"*. A restaurant nobody has asked
 *    tonight says so plainly instead of pretending everything is on.
 */
export async function applyAvailability(opts: {
  merchantId: string;
  pingId: string | null;
  changes: AvailabilityChange[];
  appliedByUserId: string | null;
  /** Kept verbatim, before a model touched it. */
  replyText: string;
  source: "staff_paste" | "merchant" | "cloud";
}): Promise<{ changed: number }> {
  const now = new Date();
  const soldOut = opts.changes.filter((c) => c.soldOut).map((c) => c.itemId);
  const backOn = opts.changes.filter((c) => !c.soldOut).map((c) => c.itemId);

  await prisma.$transaction(async (tx) => {
    if (soldOut.length > 0) {
      await tx.merchantProduct.updateMany({
        // Scoped by merchant as well as id, so an id from somewhere else cannot
        // reach across to another business's menu.
        where: { id: { in: soldOut }, merchantId: opts.merchantId },
        data: { soldOutAt: now },
      });
    }
    if (backOn.length > 0) {
      await tx.merchantProduct.updateMany({
        where: { id: { in: backOn }, merchantId: opts.merchantId },
        data: { soldOutAt: null },
      });
    }

    // Stamped even when nothing changed: "they told us and nothing was out" is
    // a confirmation, and the freshest possible answer to "is this still true".
    await tx.merchant.update({
      where: { id: opts.merchantId },
      data: { availabilityCheckedAt: now },
    });

    if (opts.pingId) {
      await tx.availabilityPing.update({
        where: { id: opts.pingId },
        data: {
          replyText: opts.replyText.slice(0, 1500),
          repliedAt: now,
          appliedAt: now,
          appliedByUserId: opts.appliedByUserId,
          source: opts.source,
          changedCount: opts.changes.length,
        },
      });
    } else {
      // A reply with no ping behind it — somebody messaged us unprompted, which
      // is the best possible outcome and must not be dropped for lack of a row.
      await tx.availabilityPing.create({
        data: {
          merchantId: opts.merchantId,
          replyText: opts.replyText.slice(0, 1500),
          repliedAt: now,
          appliedAt: now,
          appliedByUserId: opts.appliedByUserId,
          source: opts.source,
          changedCount: opts.changes.length,
        },
      });
    }
  });

  return { changed: opts.changes.length };
}
