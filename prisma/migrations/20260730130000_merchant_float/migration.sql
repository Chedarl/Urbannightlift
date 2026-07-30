-- Merchant float: let a business settle weekly instead of paying every fee up front.
--
-- The limit defaults to 0 (no float) on every existing merchant, so this
-- migration grants nobody credit. A float is only ever opened by a person.

ALTER TABLE "Merchant"
  ADD COLUMN "floatLimitXaf" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "floatSuspended" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "floatGrantedAt" TIMESTAMP(3),
  ADD COLUMN "floatGrantedByUserId" TEXT;

-- Append-only. The balance is summed from these rows and never stored.
CREATE TABLE "MerchantFloatLedger" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "orderId" TEXT,
  "amountXaf" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "note" TEXT,
  "recordedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MerchantFloatLedger_pkey" PRIMARY KEY ("id")
);

-- One charge per order, so a retried request cannot double-charge a float.
CREATE UNIQUE INDEX "MerchantFloatLedger_orderId_type_key"
  ON "MerchantFloatLedger"("orderId", "type");
CREATE INDEX "MerchantFloatLedger_merchantId_createdAt_idx"
  ON "MerchantFloatLedger"("merchantId", "createdAt");

ALTER TABLE "MerchantFloatLedger"
  ADD CONSTRAINT "MerchantFloatLedger_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MerchantFloatLedger"
  ADD CONSTRAINT "MerchantFloatLedger_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
