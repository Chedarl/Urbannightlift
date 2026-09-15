-- The rider's tip.
--
-- Nullable rather than `DEFAULT 0`: null means "this order predates tipping",
-- zero means "this customer was offered a tip and chose not to". Those are
-- different facts, and collapsing them would make the take-up rate — the only
-- number that says whether the feature is worth keeping — unknowable from the
-- first day onward.
ALTER TABLE "Order" ADD COLUMN "tipXaf" INTEGER;
