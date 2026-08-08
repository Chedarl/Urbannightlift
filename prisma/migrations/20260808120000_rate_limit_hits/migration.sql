-- One recorded attempt at something a stranger can do without an account.
-- The public forms had no limit of any kind; this is what gives them one.
CREATE TABLE "RateLimitHit" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("id")
);

-- The lookup every check makes: how many times has this subject done this
-- lately.
CREATE INDEX "RateLimitHit_purpose_subject_createdAt_idx"
    ON "RateLimitHit"("purpose", "subject", "createdAt");

-- The one the nightly prune makes.
CREATE INDEX "RateLimitHit_createdAt_idx" ON "RateLimitHit"("createdAt");
