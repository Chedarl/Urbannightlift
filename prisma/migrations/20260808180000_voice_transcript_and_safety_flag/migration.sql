-- What the voice note says, so a dispatcher can read it rather than find
-- somewhere quiet to listen at 1 AM. The recording is kept and still playable;
-- this is a second opinion on it, never a replacement.
ALTER TABLE "Order" ADD COLUMN "voiceTranscript" TEXT;
ALTER TABLE "Order" ADD COLUMN "voiceTranscribedAt" TIMESTAMP(3);

-- A concern raised about the free text on an order. Never a rejection: a model
-- is not a judge, and refusing a legitimate order at 1 AM because a word looked
-- wrong is worse than showing a dispatcher a sentence to glance at.
ALTER TABLE "Order" ADD COLUMN "safetyFlag" TEXT;
ALTER TABLE "Order" ADD COLUMN "safetyFlaggedAt" TIMESTAMP(3);

-- The needs-attention panel reads flagged orders worst-first, so the timestamp
-- is what it sorts and filters on.
CREATE INDEX "Order_safetyFlaggedAt_idx" ON "Order"("safetyFlaggedAt");
