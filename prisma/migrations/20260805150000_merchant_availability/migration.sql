-- What is actually on the fire right now.
--
-- Everywhere else in this market you order a dish and find out it ran out when
-- the rider arrives. Asking the restaurant and putting the answer in front of a
-- customer within a minute is the one thing no competitor here does.
--
-- Stated in the schema because it shapes everything above it: **a wa.me ping
-- cannot receive a reply.** It opens WhatsApp with the message typed, and the
-- answer lands in the owner's phone. So an answer arrives one of three ways,
-- and `AvailabilityPing.source` records which: `staff_paste` when somebody
-- pasted the reply back in, `merchant` when the business tapped the signed link
-- and typed it themselves, `cloud` when Meta finally approves the Cloud API and
-- delivers it directly.
--
-- The table is append-only. "Who said this was available, and when" must never
-- be a memory.

-- When the business last told us what they have.
ALTER TABLE "Merchant" ADD COLUMN "availabilityCheckedAt" TIMESTAMP(3);

-- Deliberately separate from `available`, which is the merchant's standing
-- menu. "We do not sell this" and "we are out tonight" are different facts, and
-- only the second one should clear itself.
ALTER TABLE "MerchantProduct" ADD COLUMN "soldOutAt" TIMESTAMP(3);

CREATE TABLE "AvailabilityPing" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentByUserId" TEXT,
    "replyText" TEXT,
    "repliedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'staff_paste',
    "appliedAt" TIMESTAMP(3),
    "appliedByUserId" TEXT,
    "changedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AvailabilityPing_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AvailabilityPing_merchantId_sentAt_idx" ON "AvailabilityPing"("merchantId", "sentAt");

ALTER TABLE "AvailabilityPing" ADD CONSTRAINT "AvailabilityPing_merchantId_fkey"
    FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
