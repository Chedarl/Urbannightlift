-- Provenance for order coordinates: null source = the customer pinned the
-- location themselves; CATALOGUE/OSM = recovered from free text by the resolver.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "pickupGeoSource" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "pickupGeoConfidence" DOUBLE PRECISION;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryGeoSource" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryGeoConfidence" DOUBLE PRECISION;

-- Measurement: how much of the free-text address problem the free resolver covers.
CREATE TABLE IF NOT EXISTS "AddressResolutionLog" (
  "id" TEXT NOT NULL,
  "rawText" TEXT NOT NULL,
  "resolved" BOOLEAN NOT NULL,
  "source" TEXT,
  "confidence" DOUBLE PRECISION,
  "matchedName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AddressResolutionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AddressResolutionLog_resolved_idx" ON "AddressResolutionLog"("resolved");
CREATE INDEX IF NOT EXISTS "AddressResolutionLog_createdAt_idx" ON "AddressResolutionLog"("createdAt");
