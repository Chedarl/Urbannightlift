-- Rider float: company cash a rider carries so they never shop with their own
-- money. Mirrors the merchant float, pointed the other way.
--
-- Every existing rider lands at limit 0 — this grants nobody anything.

ALTER TABLE "User"
  ADD COLUMN "floatLimitXaf" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "floatSuspended" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "floatGrantedAt" TIMESTAMP(3),
  ADD COLUMN "floatGrantedByUserId" TEXT;

CREATE TABLE "RiderFloatLedger" (
  "id" TEXT NOT NULL,
  "riderId" TEXT NOT NULL,
  "amountXaf" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "note" TEXT,
  "recordedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RiderFloatLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RiderFloatLedger_riderId_createdAt_idx"
  ON "RiderFloatLedger"("riderId", "createdAt");

ALTER TABLE "RiderFloatLedger"
  ADD CONSTRAINT "RiderFloatLedger_riderId_fkey"
  FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Night concierge: B2B night logistics. Always human-quoted, and off by default
-- until the owner switches it on in admin Settings.
ALTER TYPE "ServiceType" ADD VALUE IF NOT EXISTS 'CONCIERGE_NIGHT';
