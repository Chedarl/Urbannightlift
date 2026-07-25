-- Places we know the coordinates of because a rider actually delivered there.
CREATE TABLE IF NOT EXISTS "VerifiedPlace" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "normalizedText" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "confirmations" INTEGER NOT NULL DEFAULT 1,
    "lastConfirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerifiedPlace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VerifiedPlace_customerId_normalizedText_key"
    ON "VerifiedPlace"("customerId", "normalizedText");
CREATE INDEX IF NOT EXISTS "VerifiedPlace_normalizedText_idx" ON "VerifiedPlace"("normalizedText");

-- Why deliveries fail, and what each failure cost.
CREATE TABLE IF NOT EXISTS "DeliveryFailure" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "riderId" TEXT,
    "costXaf" INTEGER,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryFailure_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DeliveryFailure_orderId_idx" ON "DeliveryFailure"("orderId");
CREATE INDEX IF NOT EXISTS "DeliveryFailure_reason_idx" ON "DeliveryFailure"("reason");
CREATE INDEX IF NOT EXISTS "DeliveryFailure_createdAt_idx" ON "DeliveryFailure"("createdAt");

DO $$
BEGIN
    ALTER TABLE "DeliveryFailure"
        ADD CONSTRAINT "DeliveryFailure_orderId_fkey"
        FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
