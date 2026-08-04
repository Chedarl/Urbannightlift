-- A second reading of the receipt photo the rider uploaded.
--
-- Never used to charge anybody and never written into goodsActualXaf: it exists
-- so a disagreement with what the rider typed can be raised as a question for a
-- dispatcher. Null means the receipt was not checked, which is deliberately
-- distinct from "checked and agreed".
ALTER TABLE "Order" ADD COLUMN "goodsReceiptReadXaf" INTEGER;
ALTER TABLE "Order" ADD COLUMN "goodsReceiptReadAt" TIMESTAMP(3);
