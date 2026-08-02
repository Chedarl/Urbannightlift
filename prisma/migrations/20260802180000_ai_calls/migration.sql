-- Every call to a model, and what it cost.
--
-- A model fails quietly by design here: it returns null and the caller degrades
-- to what it did before. That is the right behaviour and it is also how a
-- feature stops working without anyone noticing, so the attempts are recorded
-- and shown on /admin/settings beside the maps and mail readouts.
CREATE TABLE "AiCall" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "ms" INTEGER NOT NULL,
    "tokens" INTEGER,
    "error" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCall_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiCall_purpose_createdAt_idx" ON "AiCall"("purpose", "createdAt");
CREATE INDEX "AiCall_ok_createdAt_idx" ON "AiCall"("ok", "createdAt");
