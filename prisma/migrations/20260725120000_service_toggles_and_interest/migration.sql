-- Services the owner currently offers. Anything not listed shows as "coming soon"
-- and is rejected server-side, so services can be introduced sequentially from the
-- admin Settings page without a deploy.
ALTER TABLE "OperatingSettings"
  ADD COLUMN IF NOT EXISTS "enabledServices" "ServiceType"[] DEFAULT ARRAY[]::"ServiceType"[];

-- Existing installs start with the four live services; Urgent item pickup,
-- Custom errand and Verified merchant delivery begin on hold.
UPDATE "OperatingSettings"
SET "enabledServices" = ARRAY[
  'MEDICINE_PICKUP',
  'FOOD_PICKUP',
  'GROCERY_PICKUP',
  'SMALL_PARCEL'
]::"ServiceType"[]
WHERE "enabledServices" IS NULL OR cardinality("enabledServices") = 0;

-- Waiting list for services that aren't live yet (market-demand signal).
CREATE TABLE IF NOT EXISTS "ServiceInterest" (
  "id" TEXT NOT NULL,
  "serviceType" "ServiceType" NOT NULL,
  "whatsappNumber" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'en',
  "notified" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceInterest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ServiceInterest_serviceType_whatsappNumber_key"
  ON "ServiceInterest"("serviceType", "whatsappNumber");
CREATE INDEX IF NOT EXISTS "ServiceInterest_serviceType_idx" ON "ServiceInterest"("serviceType");
CREATE INDEX IF NOT EXISTS "ServiceInterest_createdAt_idx" ON "ServiceInterest"("createdAt");
