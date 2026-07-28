-- Merchant catalogue: coordinates, night availability, verification, products,
-- the pharmacy duty rotation, and indicative dish prices.
--
-- Customers typed the vendor's name free-hand, so nothing knew where the place
-- was. Merchants imported from OpenStreetMap land here unverified and stay
-- invisible to customers until a human has called them.

ALTER TABLE "Merchant"
  ADD COLUMN "subcategory"     TEXT,
  ADD COLUMN "neighbourhood"   TEXT,
  ADD COLUMN "arrondissement"  "Arrondissement",
  ADD COLUMN "latitude"        DOUBLE PRECISION,
  ADD COLUMN "longitude"       DOUBLE PRECISION,
  ADD COLUMN "zoneId"          TEXT,
  ADD COLUMN "nightOpen"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "open24h"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "acceptingOrders" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "website"         TEXT,
  ADD COLUMN "photoUrl"        TEXT,
  ADD COLUMN "aliases"         TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "searchKey"       TEXT NOT NULL DEFAULT '',
  ADD COLUMN "source"          TEXT NOT NULL DEFAULT 'admin',
  ADD COLUMN "osmId"           TEXT,
  ADD COLUMN "popularityRank"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "lastConfirmedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Merchant_osmId_key" ON "Merchant"("osmId");
CREATE INDEX "Merchant_category_verified_active_idx" ON "Merchant"("category", "verified", "active");
CREATE INDEX "Merchant_verified_active_idx" ON "Merchant"("verified", "active");
CREATE INDEX "Merchant_popularityRank_idx" ON "Merchant"("popularityRank");

ALTER TABLE "Merchant"
  ADD CONSTRAINT "Merchant_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- The three merchants seeded before this were entered by hand, so they keep
-- their trusted status; everything imported later starts unverified.
UPDATE "Merchant" SET "searchKey" = lower("merchantName") WHERE "searchKey" = '';

CREATE TABLE "MerchantProduct" (
  "id"             TEXT NOT NULL,
  "merchantId"     TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "nameFr"         TEXT,
  "priceXaf"       INTEGER,
  "unit"           TEXT,
  "photoUrl"       TEXT,
  "available"      BOOLEAN NOT NULL DEFAULT true,
  "popularityRank" INTEGER NOT NULL DEFAULT 0,
  "source"         TEXT NOT NULL DEFAULT 'admin',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MerchantProduct_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MerchantProduct_merchantId_available_idx" ON "MerchantProduct"("merchantId", "available");

ALTER TABLE "MerchantProduct"
  ADD CONSTRAINT "MerchantProduct_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PopularDish" (
  "id"             TEXT NOT NULL,
  "nameEn"         TEXT NOT NULL,
  "nameFr"         TEXT NOT NULL,
  "category"       TEXT NOT NULL DEFAULT 'FOOD',
  "priceMinXaf"    INTEGER NOT NULL,
  "priceMaxXaf"    INTEGER NOT NULL,
  "popularityRank" INTEGER NOT NULL DEFAULT 0,
  "active"         BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PopularDish_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PopularDish_active_popularityRank_idx" ON "PopularDish"("active", "popularityRank");

CREATE TABLE "PharmacyDuty" (
  "id"         TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "startsOn"   TIMESTAMP(3) NOT NULL,
  "endsOn"     TIMESTAMP(3) NOT NULL,
  "notes"      TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PharmacyDuty_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PharmacyDuty_startsOn_endsOn_idx" ON "PharmacyDuty"("startsOn", "endsOn");

ALTER TABLE "PharmacyDuty"
  ADD CONSTRAINT "PharmacyDuty_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
