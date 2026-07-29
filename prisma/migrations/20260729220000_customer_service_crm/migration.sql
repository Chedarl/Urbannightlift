-- Customer service: what staff know, kept properly.
--
-- `Customer.notes` was a single overwritable column, so the second person to
-- write in it destroyed what the first one knew. A support desk runs on the
-- history of what was said and who said it, so notes become an append-only
-- stream with an author on every row. The old column stays exactly where it is
-- and keeps rendering — nothing already written is thrown away.

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "blockedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "blockedReason" TEXT;

CREATE TABLE IF NOT EXISTS "CustomerNote" (
  "id"         TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "authorId"   TEXT,
  "authorName" TEXT NOT NULL,
  "body"       TEXT NOT NULL,
  "kind"       TEXT NOT NULL DEFAULT 'GENERAL',
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomerNote_customerId_createdAt_idx"
  ON "CustomerNote"("customerId", "createdAt");

-- A customer being deleted takes their notes with them; a note about somebody
-- who no longer exists is not a record, it is a leak.
DO $$
BEGIN
  ALTER TABLE "CustomerNote"
    ADD CONSTRAINT "CustomerNote_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
