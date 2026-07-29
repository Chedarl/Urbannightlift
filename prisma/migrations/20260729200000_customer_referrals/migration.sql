-- Customer referrals, and the switch that puts the ambassador programme away.
--
-- These were one thing and should never have been. A referral is a customer
-- telling a friend — one-to-one, no obligations, no relationship with us. A
-- brand ambassador represents us in public under a brief, with content
-- expectations and a term. Mixing them meant neither worked properly.

ALTER TABLE "Customer" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "Customer" ADD COLUMN "referredByCustomerId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "referredByCodeAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "referralCreditXaf" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "Customer_referralCode_key" ON "Customer"("referralCode");
CREATE INDEX "Customer_referredByCustomerId_idx" ON "Customer"("referredByCustomerId");

CREATE TABLE "ReferralLedger" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "amountXaf" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReferralLedger_customerId_createdAt_idx" ON "ReferralLedger"("customerId", "createdAt");
-- One reward per order per type: the guard against paying twice when a
-- delivery is marked complete more than once.
CREATE UNIQUE INDEX "ReferralLedger_orderId_type_key" ON "ReferralLedger"("orderId", "type");

ALTER TABLE "OperatingSettings" ADD COLUMN "referralRewardPercent" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "OperatingSettings" ADD COLUMN "referralFriendDiscountXaf" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OperatingSettings" ADD COLUMN "referralsEnabled" BOOLEAN NOT NULL DEFAULT true;
-- Off until it is rebuilt as marketing rather than a second referral scheme.
ALTER TABLE "OperatingSettings" ADD COLUMN "ambassadorProgrammeEnabled" BOOLEAN NOT NULL DEFAULT false;
