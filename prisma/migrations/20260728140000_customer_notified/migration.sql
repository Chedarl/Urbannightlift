-- Whether anyone has actually told this customer their order moved. Push is
-- opt-in, so dispatch needs to see the gap rather than assume it is covered.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerNotifiedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerNotifiedStage" TEXT;
