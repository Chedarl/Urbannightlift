-- A merchant's own login.
--
-- Everything a merchant might want to change — their prices, their opening
-- state, what they owe on their float — existed only behind /admin, so a shop
-- had to phone the owner to correct a price. These four columns are the whole
-- of what a merchant account needs: they mirror `Customer` exactly (WhatsApp
-- number plus a short PIN, no SMS cost, with an attempt lockout because a
-- business number is public).
--
-- Nullable by design. Every existing merchant keeps working untouched; a null
-- pinHash simply means nobody from that business has claimed the account yet.

ALTER TABLE "Merchant" ADD COLUMN "pinHash" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "pinAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Merchant" ADD COLUMN "pinLockedUntil" TIMESTAMP(3);
ALTER TABLE "Merchant" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
