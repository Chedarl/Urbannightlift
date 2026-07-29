-- Google Search Console ownership token, owned by the operator rather than the
-- build. An environment variable on Vercel only applies to the next
-- deployment, so setting one and pressing "Verify" fails with nothing on
-- screen explaining why. Stored here it is live immediately.
ALTER TABLE "OperatingSettings" ADD COLUMN "googleSiteVerification" TEXT;
