-- When an order was approved, and by whom.
--
-- Approval previously existed only as a row in the status history, so whether
-- step one had been completed was something you reconstructed rather than
-- read. The dispatch console now locks each step behind the one before it, and
-- that needs a fact on the order itself.
ALTER TABLE "Order" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "approvedByUserId" TEXT;

-- Backfill from the history so orders already approved do not read as unstarted.
UPDATE "Order" o
SET "approvedAt" = h.first_approved
FROM (
  SELECT "orderId", MIN("createdAt") AS first_approved
  FROM "OrderStatusHistory"
  WHERE "toStatus" = 'APPROVED'
  GROUP BY "orderId"
) h
WHERE o.id = h."orderId" AND o."approvedAt" IS NULL;

-- Anything already past review is approved by definition, even if the history
-- row is missing — an order cannot have been delivered without being approved.
UPDATE "Order"
SET "approvedAt" = COALESCE("approvedAt", "createdAt")
WHERE "approvedAt" IS NULL
  AND "orderStatus" NOT IN ('NEW_REQUEST', 'AWAITING_DISPATCHER_REVIEW', 'REJECTED', 'CANCELLED_BY_CUSTOMER');
