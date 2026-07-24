-- Customer-uploaded payment screenshot (MoMo/Orange proof) for manual verification
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "proofScreenshotUrl" TEXT;
