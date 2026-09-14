-- Make the fare something the owner can change.
--
-- `DEFAULT_FARE` in src/lib/orders/fare.ts carried the comment "The knobs, all
-- admin-editable" while being a hardcoded constant: no table, no screen, no way
-- to move a single figure without a deploy. The owner remembered asking for
-- this and was right that it never landed.
--
-- The defaults here are NOT the old values. They are the proposal, measured
-- against what the market actually charges for the same trip in Yaoundé:
--
--   Bastos -> Mvan, 11.6 km by road
--     Yango Economy      ~1 020 XAF   (450 minimum, 88/km, published tariff)
--     moto-taxi          ~1 350 XAF   (negotiated, at night)
--     us, before this     3 200 XAF
--     us, after this     ~2 200 XAF   (ride + errand + late-night band)
--
-- Three to four times the market rate is why customers complained. The change
-- is not simply "charge less": it is to stop pricing the wrong thing. Yango
-- sells a ride. We sell an errand — somebody goes, queues, buys and comes back,
-- at night, when taxis are unreliable and buses have stopped. So the bill is
-- split: the ride priced near the market, the errand charged as its own line
-- the customer can see. A total made of defensible parts survives the door.

ALTER TABLE "OperatingSettings"
  ADD COLUMN "fareMinimumXaf"        INTEGER          NOT NULL DEFAULT 850,
  ADD COLUMN "fareIncludedKm"        DOUBLE PRECISION NOT NULL DEFAULT 2.5,
  ADD COLUMN "farePerKmXaf"          INTEGER          NOT NULL DEFAULT 150,
  ADD COLUMN "fareErrandXaf"         INTEGER          NOT NULL DEFAULT 500,
  ADD COLUMN "fareLateNightPercent"  INTEGER          NOT NULL DEFAULT 15,
  ADD COLUMN "fareLateNightFromHour" INTEGER          NOT NULL DEFAULT 23,
  ADD COLUMN "fareYellowPercent"     INTEGER          NOT NULL DEFAULT 8,
  ADD COLUMN "fareRedPercent"        INTEGER          NOT NULL DEFAULT 20;
