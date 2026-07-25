-- Customer accounts: a login PIN keyed on the WhatsApp number already used for
-- orders, so signing up claims a guest's existing order history.

-- 1) Deduplicate customers sharing a WhatsApp number before adding the unique
--    index. Duplicates are possible because order creation used
--    findFirst-then-create with no unique constraint. Keep the earliest row and
--    repoint its duplicates' orders/payments/addresses onto it.
WITH ranked AS (
  SELECT
    "id",
    "whatsappNumber",
    FIRST_VALUE("id") OVER (
      PARTITION BY "whatsappNumber" ORDER BY "createdAt" ASC, "id" ASC
    ) AS keep_id
  FROM "Customer"
),
dupes AS (
  SELECT "id", keep_id FROM ranked WHERE "id" <> keep_id
)
UPDATE "Order" o
SET "customerId" = d.keep_id
FROM dupes d
WHERE o."customerId" = d."id";

WITH ranked AS (
  SELECT
    "id",
    "whatsappNumber",
    FIRST_VALUE("id") OVER (
      PARTITION BY "whatsappNumber" ORDER BY "createdAt" ASC, "id" ASC
    ) AS keep_id
  FROM "Customer"
),
dupes AS (
  SELECT "id", keep_id FROM ranked WHERE "id" <> keep_id
)
UPDATE "Payment" p
SET "customerId" = d.keep_id
FROM dupes d
WHERE p."customerId" = d."id";

-- Fold the duplicates' order counts into the surviving row, then delete them.
WITH ranked AS (
  SELECT
    "id",
    "whatsappNumber",
    "totalOrders",
    FIRST_VALUE("id") OVER (
      PARTITION BY "whatsappNumber" ORDER BY "createdAt" ASC, "id" ASC
    ) AS keep_id
  FROM "Customer"
),
dupes AS (
  SELECT "id", keep_id, "totalOrders" FROM ranked WHERE "id" <> keep_id
),
totals AS (
  SELECT keep_id, SUM("totalOrders") AS extra FROM dupes GROUP BY keep_id
)
UPDATE "Customer" c
SET "totalOrders" = c."totalOrders" + t.extra
FROM totals t
WHERE c."id" = t.keep_id;

WITH ranked AS (
  SELECT
    "id",
    "whatsappNumber",
    FIRST_VALUE("id") OVER (
      PARTITION BY "whatsappNumber" ORDER BY "createdAt" ASC, "id" ASC
    ) AS keep_id
  FROM "Customer"
)
DELETE FROM "Customer"
WHERE "id" IN (SELECT "id" FROM ranked WHERE "id" <> keep_id);

-- 2) Account columns.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "pinHash" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "pinAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "pinLockedUntil" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

-- 3) One customer per WhatsApp number from here on.
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_whatsappNumber_key" ON "Customer"("whatsappNumber");

-- 4) Saved addresses.
CREATE TABLE IF NOT EXISTS "CustomerAddress" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "locationText" TEXT NOT NULL,
  "landmark" TEXT,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "zoneId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomerAddress_customerId_idx" ON "CustomerAddress"("customerId");

ALTER TABLE "CustomerAddress"
  DROP CONSTRAINT IF EXISTS "CustomerAddress_customerId_fkey";
ALTER TABLE "CustomerAddress"
  ADD CONSTRAINT "CustomerAddress_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
