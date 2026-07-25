-- Support requests become cases: linked to the order and customer they are
-- about, assignable, and answerable.
ALTER TABLE "SupportRequest" ADD COLUMN IF NOT EXISTS "orderId" TEXT;
ALTER TABLE "SupportRequest" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "SupportRequest" ADD COLUMN IF NOT EXISTS "assignedToUserId" TEXT;
ALTER TABLE "SupportRequest" ADD COLUMN IF NOT EXISTS "lastCustomerMessageAt" TIMESTAMP(3);
ALTER TABLE "SupportRequest" ADD COLUMN IF NOT EXISTS "lastStaffMessageAt" TIMESTAMP(3);
ALTER TABLE "SupportRequest" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "SupportRequest_orderId_idx" ON "SupportRequest"("orderId");
CREATE INDEX IF NOT EXISTS "SupportRequest_customerId_idx" ON "SupportRequest"("customerId");

DO $$
BEGIN
    ALTER TABLE "SupportRequest"
        ADD CONSTRAINT "SupportRequest_orderId_fkey"
        FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "SupportRequest"
        ADD CONSTRAINT "SupportRequest_customerId_fkey"
        FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The conversation itself.
CREATE TABLE IF NOT EXISTS "CaseMessage" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorType" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorName" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CaseMessage_caseId_idx" ON "CaseMessage"("caseId");

DO $$
BEGIN
    ALTER TABLE "CaseMessage"
        ADD CONSTRAINT "CaseMessage_caseId_fkey"
        FOREIGN KEY ("caseId") REFERENCES "SupportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The opening message of every existing request becomes the first message in
-- its thread, so old requests are answerable rather than stranded.
INSERT INTO "CaseMessage" ("id", "caseId", "body", "authorType", "authorName", "internal", "createdAt")
SELECT
    'seed-' || "id",
    "id",
    "message",
    'CUSTOMER',
    "fullName",
    false,
    "createdAt"
FROM "SupportRequest"
WHERE NOT EXISTS (SELECT 1 FROM "CaseMessage" WHERE "CaseMessage"."caseId" = "SupportRequest"."id");

UPDATE "SupportRequest"
SET "lastCustomerMessageAt" = "createdAt"
WHERE "lastCustomerMessageAt" IS NULL;

-- Rider zone coverage and availability.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "zoneIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isOnline" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);
