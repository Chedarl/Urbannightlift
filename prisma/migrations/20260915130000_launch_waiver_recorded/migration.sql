-- What the launch offer took off, recorded on the order rather than only
-- applied to the payment.
--
-- Nullable, and not backfilled: the orders that came before this either had no
-- waiver or had one that was never written down, and inventing a figure for
-- them would put a number in the accounts that nobody computed.
ALTER TABLE "Order" ADD COLUMN "launchWaiverXaf" INTEGER;
