-- Quote handshake: dispatch prices an order, the customer agrees to that price
-- before any rider is committed to the trip.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "quoteSentAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "quoteAcceptedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "quoteDeclinedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "quoteDeclineReason" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "quotedFeeXaf" INTEGER;

-- Rider assignment handshake: an assignment is an offer until it is accepted.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "riderAcceptedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "riderDeclinedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "riderDeclineReason" TEXT;

-- Commission split, frozen on the order at delivery so a later rate change
-- never rewrites completed accounts.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "riderSharePercent" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "riderPayoutXaf" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "companyEarningXaf" INTEGER;

-- Cash reconciliation: on cash on delivery the rider holds our money until it
-- is settled.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cashCollectedXaf" INTEGER;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cashSettledAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cashSettledByUserId" TEXT;

ALTER TABLE "OperatingSettings" ADD COLUMN IF NOT EXISTS "riderSharePercent" INTEGER NOT NULL DEFAULT 60;

-- Housekeeping: test and archived orders leave every operational view and
-- every number, without anything being destroyed.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "isTest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "archivedByUserId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "archiveReason" TEXT;

CREATE INDEX IF NOT EXISTS "Order_isTest_archivedAt_idx" ON "Order"("isTest", "archivedAt");

-- Append-only record of every privileged change and who made it.
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityLabel" TEXT,
    "changes" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- Web Push device registrations.
CREATE TABLE IF NOT EXISTS "PushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userId" TEXT,
    "customerId" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX IF NOT EXISTS "PushSubscription_userId_idx" ON "PushSubscription"("userId");
CREATE INDEX IF NOT EXISTS "PushSubscription_customerId_idx" ON "PushSubscription"("customerId");
