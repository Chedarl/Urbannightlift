-- Account-first ordering, and how the delivery went.
--
-- Two independent additions bundled because both are pure column adds with
-- safe defaults and no backfill:
--
-- 1. requireAccountToOrder — every client signs up before ordering, so every
--    order lives inside their own portal. On by default; the owner can lift it.
-- 2. Order rating — one to five stars, an optional comment, and a timestamp,
--    asked once after the goods are in hand. The only real measure of a night.

ALTER TABLE "OperatingSettings"
  ADD COLUMN IF NOT EXISTS "requireAccountToOrder" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "ratingStars" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "ratingComment" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "ratedAt" TIMESTAMP(3);
