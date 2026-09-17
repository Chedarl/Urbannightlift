-- The hour a business stops serving, and the hour it starts.
--
-- `nightOpen` is one bit and it cannot express "open until midnight", which is
-- what a large share of the owner's first real catalogue actually is. Kept as a
-- bit, a place closing at 00:00 either vanishes from the 10 p.m. screen where it
-- is genuinely open, or claims the 2 a.m. screen where it is genuinely shut.
--
-- Nullable, because most existing rows have never been asked. A NULL here means
-- "we were never told", which `openAtHour` treats differently from a stated
-- midnight close: it falls back to `nightOpen` and the trading window, exactly
-- as every row behaved before this column existed.
ALTER TABLE "Merchant" ADD COLUMN "closesAtHour" INTEGER;
ALTER TABLE "Merchant" ADD COLUMN "opensAtHour" INTEGER;
