-- Shopping orders carry a second amount: the goods we buy for the customer.
--
-- Until now Payment.amountXaf was the delivery fee alone, so a rider who spent
-- real money on food was never reimbursed and the customer was never billed for
-- what they actually asked us to buy. These columns make that money visible.
--
-- All nullable with no defaults: every existing order is unaffected, and a
-- non-shopping order never uses them.

ALTER TABLE "Order"
  ADD COLUMN "goodsCapXaf" INTEGER,
  ADD COLUMN "goodsActualXaf" INTEGER,
  ADD COLUMN "goodsReceiptUrl" TEXT,
  ADD COLUMN "goodsRecordedAt" TIMESTAMP(3),
  ADD COLUMN "goodsRecordedById" TEXT,
  ADD COLUMN "overCapApprovedXaf" INTEGER,
  ADD COLUMN "overCapApprovedAt" TIMESTAMP(3),
  ADD COLUMN "goodsAdvancedXaf" INTEGER;

-- Dispatch needs to find the orders where a rider has bought something and the
-- receipt is over what the customer agreed to, because those are not collectable
-- until the customer approves.
CREATE INDEX "Order_goodsRecordedAt_idx" ON "Order"("goodsRecordedAt");
