-- Rider identity, rider applications, ambassador logins, voice-note ordering.
--
-- Three separate asks, one migration because they are all additive columns and
-- two new objects; splitting them would mean three DB-setup runs for no gain.
--
-- Privacy note that the column names alone do not carry: every *IdCard* and
-- voice-note column below holds something that must never reach a customer or
-- a public URL. They are read only through the ADMIN_ROLES-gated media route.

-- Riders: what a customer may see, and what only staff may see.
ALTER TABLE "User" ADD COLUMN "photoUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "vehicleRef" TEXT;
ALTER TABLE "User" ADD COLUMN "idCardNumber" TEXT;
ALTER TABLE "User" ADD COLUMN "idCardFrontUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "idCardBackUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "idVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "idVerifiedById" TEXT;

-- Somebody asking to ride for us. Deliberately not a User row: a staff row
-- carries a login, and an applicant must not hold one before a human has
-- looked at their ID.
CREATE TYPE "RiderApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "RiderApplication" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "whatsappNumber" TEXT NOT NULL,
    "email" TEXT,
    "neighbourhood" TEXT,
    "zonePreference" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "idCardNumber" TEXT,
    "idCardFrontUrl" TEXT,
    "idCardBackUrl" TEXT,
    "photoUrl" TEXT,
    "vehicleType" TEXT,
    "vehicleRef" TEXT,
    "hasLicence" BOOLEAN NOT NULL DEFAULT false,
    "ownsVehicle" BOOLEAN NOT NULL DEFAULT true,
    "availability" TEXT,
    "yearsExperience" INTEGER,
    "knowsCity" TEXT,
    "notes" TEXT,
    "status" "RiderApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "createdUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiderApplication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RiderApplication_status_idx" ON "RiderApplication"("status");
CREATE INDEX "RiderApplication_whatsappNumber_idx" ON "RiderApplication"("whatsappNumber");

-- Ambassadors get their own login so they can watch their earnings without
-- asking us, and without ever holding a staff account.
ALTER TABLE "Ambassador" ADD COLUMN "reach" TEXT;
ALTER TABLE "Ambassador" ADD COLUMN "pinHash" TEXT;
ALTER TABLE "Ambassador" ADD COLUMN "pinAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Ambassador" ADD COLUMN "pinLockedUntil" TIMESTAMP(3);
ALTER TABLE "Ambassador" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- Voice-note ordering, shipped switched OFF.
ALTER TABLE "Order" ADD COLUMN "voiceNoteUrl" TEXT;
ALTER TABLE "Order" ADD COLUMN "voiceNoteSeconds" INTEGER;
ALTER TABLE "OperatingSettings" ADD COLUMN "voiceOrderingEnabled" BOOLEAN NOT NULL DEFAULT false;
