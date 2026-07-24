-- Yaoundé location catalogue for the citywide location picker
CREATE TYPE "Arrondissement" AS ENUM ('YAOUNDE_I','YAOUNDE_II','YAOUNDE_III','YAOUNDE_IV','YAOUNDE_V','YAOUNDE_VI','YAOUNDE_VII','YAOUNDE_PERIPHERY');
CREATE TYPE "LocationServiceStatus" AS ENUM ('PRIORITY','STANDARD','EXTENDED','REVIEW_REQUIRED','TEMPORARILY_UNAVAILABLE','BLOCKED');

CREATE TABLE "ServiceLocation" (
  "id" TEXT NOT NULL,
  "primaryName" TEXT NOT NULL,
  "nameEn" TEXT,
  "nameFr" TEXT,
  "aliases" TEXT[],
  "arrondissement" "Arrondissement" NOT NULL,
  "neighbourhood" TEXT NOT NULL,
  "sector" TEXT,
  "landmark" TEXT,
  "formattedAddress" TEXT,
  "googlePlaceId" TEXT,
  "plusCode" TEXT,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "zoneId" TEXT,
  "serviceStatus" "LocationServiceStatus" NOT NULL DEFAULT 'STANDARD',
  "verified" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "popularityRank" INTEGER NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL DEFAULT 'admin',
  "searchKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceLocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServiceLocation_arrondissement_idx" ON "ServiceLocation"("arrondissement");
CREATE INDEX "ServiceLocation_active_idx" ON "ServiceLocation"("active");
CREATE INDEX "ServiceLocation_popularityRank_idx" ON "ServiceLocation"("popularityRank");

ALTER TABLE "ServiceLocation" ADD CONSTRAINT "ServiceLocation_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
