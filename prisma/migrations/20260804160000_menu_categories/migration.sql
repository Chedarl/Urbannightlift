-- What makes a price list browsable.
--
-- A grid of forty ungrouped rows is a worse experience than the form it
-- replaced. Category is what lets a customer scan; description is what makes it
-- read like a menu rather than a stock take. Both are filled from the merchant's
-- own photographed board, and both are reviewed by a human before publishing.
ALTER TABLE "MerchantProduct" ADD COLUMN "category" TEXT;
ALTER TABLE "MerchantProduct" ADD COLUMN "description" TEXT;
ALTER TABLE "MerchantProduct" ADD COLUMN "descriptionFr" TEXT;
