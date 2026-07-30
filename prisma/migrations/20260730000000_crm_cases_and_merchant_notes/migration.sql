-- CRM v2 foundation: one inbox, and merchants as relationships.
--
-- Cases gain a source (so help-centre requests, order threads, incidents and
-- proactive cases share one queue) and a priority (so the desk answers the
-- worst first). Two new statuses let a case wait on the customer or be closed
-- without pretending it is still open. Macros speed the common replies, and
-- merchants get a contact log. All additive, safe defaults, no backfill.

ALTER TYPE "SupportStatus" ADD VALUE IF NOT EXISTS 'WAITING_ON_CUSTOMER';
ALTER TYPE "SupportStatus" ADD VALUE IF NOT EXISTS 'CLOSED';

DO $$ BEGIN
  CREATE TYPE "CaseSource" AS ENUM ('HELP_CENTER', 'ORDER_THREAD', 'INCIDENT', 'PROACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CasePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "SupportRequest" ADD COLUMN IF NOT EXISTS "source" "CaseSource" NOT NULL DEFAULT 'HELP_CENTER';
ALTER TABLE "SupportRequest" ADD COLUMN IF NOT EXISTS "priority" "CasePriority" NOT NULL DEFAULT 'NORMAL';

CREATE TABLE IF NOT EXISTS "CannedReply" (
  "id"        TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "category"  TEXT,
  "useCount"  INTEGER NOT NULL DEFAULT 0,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CannedReply_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CannedReply_active_idx" ON "CannedReply"("active");

CREATE TABLE IF NOT EXISTS "MerchantNote" (
  "id"         TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "authorId"   TEXT,
  "authorName" TEXT NOT NULL,
  "body"       TEXT NOT NULL,
  "kind"       TEXT NOT NULL DEFAULT 'GENERAL',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MerchantNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MerchantNote_merchantId_createdAt_idx" ON "MerchantNote"("merchantId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "MerchantNote"
    ADD CONSTRAINT "MerchantNote_merchantId_fkey"
    FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
