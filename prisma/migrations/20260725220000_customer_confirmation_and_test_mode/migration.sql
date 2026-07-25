-- The customer's own proof that the goods arrived. The rider's proof says we
-- delivered; this says they received. A dispute needs both sides.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerConfirmMethod" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerProofUrl" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerConfirmNote" TEXT;

-- Pre-launch rehearsals must never contaminate the real numbers.
ALTER TABLE "OperatingSettings" ADD COLUMN IF NOT EXISTS "testMode" BOOLEAN NOT NULL DEFAULT false;
