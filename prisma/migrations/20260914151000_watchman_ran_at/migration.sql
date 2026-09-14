-- When the watchman last completed a round.
--
-- Written on every run, alert or not, because the thing worth seeing is the
-- silence. The workflow that calls it failed 374 times over a month with the
-- only symptom being a GitHub inbox nobody was reading. This puts the absence
-- on /admin/settings, beside the maps, mail, AI and signing-secret readouts —
-- the same "make the silent thing visible" pattern that has already paid for
-- itself four times in this product.
ALTER TABLE "OperatingSettings" ADD COLUMN "watchmanRanAt" TIMESTAMP(3);
