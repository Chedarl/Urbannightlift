-- A merchant row created because a customer ordered from a business we had
-- never called.
--
-- Unique, so the second person to order from the same shop joins the row the
-- first one created rather than making a duplicate. A name cannot do that job:
-- "Pharmacie du Centre" is several different pharmacies in Yaoundé.
--
-- Nullable, because almost every row has no Place ID and never will — the
-- catalogue is mostly businesses somebody called. Postgres does not count NULLs
-- as equal, so a unique index over a mostly-null column is exactly right here.
ALTER TABLE "Merchant" ADD COLUMN "placeId" TEXT;

CREATE UNIQUE INDEX "Merchant_placeId_key" ON "Merchant"("placeId");
