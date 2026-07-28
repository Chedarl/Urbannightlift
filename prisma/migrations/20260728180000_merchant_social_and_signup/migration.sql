-- Merchants carry a social link, a logo, and a record of when they were last
-- seen trading.
--
-- The map import turned out to be mostly businesses that no longer exist, so
-- the catalogue now comes from places a person has actually seen active — a
-- Facebook/Instagram/TikTok page they browsed, or the merchant filling in their
-- own page. The link is stored to tap, not to scrape: no platform lets you
-- search for a business by name, and they block unauthenticated reads.

ALTER TABLE "Merchant"
  ADD COLUMN "socialUrl"        TEXT,
  ADD COLUMN "socialPlatform"   TEXT,
  ADD COLUMN "logoUrl"          TEXT,
  ADD COLUMN "lastSeenActiveAt" TIMESTAMP(3);
