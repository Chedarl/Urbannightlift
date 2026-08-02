-- When somebody sent this account its welcome card.
--
-- Null is the work queue: everyone who joined and has never heard from us.
-- Nullable with no default and no backfill on purpose — the accounts that
-- already exist genuinely were never welcomed, and stamping them now would
-- hide exactly the list somebody needs to work through.
ALTER TABLE "Customer" ADD COLUMN "welcomeSentAt" TIMESTAMP(3);
ALTER TABLE "Merchant" ADD COLUMN "welcomeSentAt" TIMESTAMP(3);
