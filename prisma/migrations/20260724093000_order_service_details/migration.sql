-- Structured per-service order payload (food/medicine/grocery lists, parcel dims, etc.)
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "serviceDetails" JSONB;
