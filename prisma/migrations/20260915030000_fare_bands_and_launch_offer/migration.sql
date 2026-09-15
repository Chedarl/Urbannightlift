-- The published price lists, replacing the computed formula.
--
-- `fareBands` / `fareErrandBands` are ladders of {upToKm, xaf} by road km. They
-- are nullable rather than defaulted: a null means "use the ladder shipped in
-- the code", which is what every existing row wants on the day this lands.
ALTER TABLE "OperatingSettings" ADD COLUMN IF NOT EXISTS "fareBands" JSONB;
ALTER TABLE "OperatingSettings" ADD COLUMN IF NOT EXISTS "fareErrandBands" JSONB;

-- What a hard zone adds, in francs. A percentage on a published band turns it
-- back into a computed decimal, which is the thing the bands exist to stop.
ALTER TABLE "OperatingSettings" ADD COLUMN IF NOT EXISTS "fareYellowXaf" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OperatingSettings" ADD COLUMN IF NOT EXISTS "fareRedXaf" INTEGER NOT NULL DEFAULT 500;

-- The first delivery, free, capped.
ALTER TABLE "OperatingSettings" ADD COLUMN IF NOT EXISTS "firstOrderFreeCapXaf" INTEGER NOT NULL DEFAULT 1500;

-- The night band moves from 23:00 to 01:00 on every existing row.
--
-- We trade 18:00-04:00, so a premium from 23:00 covered half our own operating
-- window and most of the volume — the price with an extra step rather than a
-- premium. Only rows still on the old default are moved; an owner who has
-- deliberately set something else keeps it.
UPDATE "OperatingSettings" SET "fareLateNightFromHour" = 1 WHERE "fareLateNightFromHour" = 23;
