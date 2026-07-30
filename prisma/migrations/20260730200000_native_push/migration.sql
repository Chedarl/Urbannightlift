-- Push that works in a store-installed app.
--
-- A Capacitor WebView does not implement the Push API, so the native apps
-- cannot use Web Push at all — they receive an FCM (Android) or APNs (iOS)
-- device token from the OS instead. Same table, same ownership rules, different
-- transport, so `platform` records which one a row is and the encryption keys
-- become nullable because a native token has none.
--
-- Existing rows are all browser subscriptions, so the default backfills them
-- correctly and no browser has to re-subscribe.

ALTER TABLE "PushSubscription" ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'web';
ALTER TABLE "PushSubscription" ALTER COLUMN "p256dh" DROP NOT NULL;
ALTER TABLE "PushSubscription" ALTER COLUMN "auth" DROP NOT NULL;
