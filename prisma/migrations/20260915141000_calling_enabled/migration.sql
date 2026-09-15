-- The switch. Off until the owner has VAPID keys and a TURN provider — a call
-- button that cannot ring anybody is worse than no call button.
ALTER TABLE "OperatingSettings" ADD COLUMN "callingEnabled" BOOLEAN NOT NULL DEFAULT false;
