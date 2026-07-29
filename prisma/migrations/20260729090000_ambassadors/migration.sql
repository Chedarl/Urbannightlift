-- Ambassadors: the marketing budget, paid against deliveries that happened.
--
-- A referred customer saves a flat amount on their first order and the person
-- who brought them earns a share of the company's margin on their next several.
-- Both come out of the company's 40% — the rider is always paid on the full,
-- undiscounted fee, because a rider who quietly earns less on referred orders
-- learns to resent them.

CREATE TYPE "AmbassadorStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

CREATE TABLE "Ambassador" (
  "id"             TEXT NOT NULL,
  "code"           TEXT NOT NULL,
  "fullName"       TEXT NOT NULL,
  "whatsappNumber" TEXT NOT NULL,
  "payoutMethod"   TEXT,
  "payoutNumber"   TEXT,
  "status"         "AmbassadorStatus" NOT NULL DEFAULT 'PENDING',
  "approvedAt"     TIMESTAMP(3),
  "approvedById"   TEXT,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Ambassador_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Ambassador_code_key" ON "Ambassador"("code");
CREATE UNIQUE INDEX "Ambassador_whatsappNumber_key" ON "Ambassador"("whatsappNumber");
CREATE INDEX "Ambassador_status_idx" ON "Ambassador"("status");

CREATE TABLE "AmbassadorLedger" (
  "id"           TEXT NOT NULL,
  "ambassadorId" TEXT NOT NULL,
  "orderId"      TEXT,
  "amountXaf"    INTEGER NOT NULL,
  "type"         TEXT NOT NULL,
  "note"         TEXT,
  "recordedById" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AmbassadorLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AmbassadorLedger_ambassadorId_createdAt_idx"
  ON "AmbassadorLedger"("ambassadorId", "createdAt");
-- One commission per order, ever. The uniqueness is the safeguard: a retry, a
-- double-click or a re-run of the accrual must never pay the same delivery twice.
CREATE UNIQUE INDEX "AmbassadorLedger_orderId_type_key" ON "AmbassadorLedger"("orderId", "type");

ALTER TABLE "AmbassadorLedger"
  ADD CONSTRAINT "AmbassadorLedger_ambassadorId_fkey" FOREIGN KEY ("ambassadorId")
    REFERENCES "Ambassador"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AmbassadorLedger_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Customer"
  ADD COLUMN "referredByAmbassadorId" TEXT,
  ADD COLUMN "referredAt" TIMESTAMP(3);

CREATE INDEX "Customer_referredByAmbassadorId_idx" ON "Customer"("referredByAmbassadorId");

ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_referredByAmbassadorId_fkey" FOREIGN KEY ("referredByAmbassadorId")
    REFERENCES "Ambassador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order"
  ADD COLUMN "ambassadorId"            TEXT,
  ADD COLUMN "discountXaf"             INTEGER,
  ADD COLUMN "ambassadorCommissionXaf" INTEGER;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_ambassadorId_fkey" FOREIGN KEY ("ambassadorId")
    REFERENCES "Ambassador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Terms live in settings so the owner can change them without a deploy; each
-- order freezes what it was charged under.
ALTER TABLE "OperatingSettings"
  ADD COLUMN "referralDiscountXaf"          INTEGER NOT NULL DEFAULT 500,
  ADD COLUMN "ambassadorCommissionPercent"  INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "ambassadorCommissionOrderCap" INTEGER NOT NULL DEFAULT 10;
