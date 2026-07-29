-- Operational email, and a record of every message we send.
--
-- The log exists because push notifications vanish and email fails silently.
-- Without it there is no way to answer "were we told?" about an order, an
-- application or a payment — which is the question that actually matters when
-- something is missed. Append-only, like the audit log and the ambassador
-- ledger.

ALTER TABLE "OperatingSettings" ADD COLUMN "notificationEmail" TEXT;
ALTER TABLE "OperatingSettings" ADD COLUMN "emailOnEveryOrder" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "OperatingSettings" ADD COLUMN "dailySummaryEmail" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "status" TEXT NOT NULL,
    "providerId" TEXT,
    "error" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationLog_event_createdAt_idx" ON "NotificationLog"("event", "createdAt");
CREATE INDEX "NotificationLog_entityType_entityId_idx" ON "NotificationLog"("entityType", "entityId");
CREATE INDEX "NotificationLog_status_idx" ON "NotificationLog"("status");
