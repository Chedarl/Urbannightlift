-- Help Center support requests
CREATE TYPE "SupportCategory" AS ENUM ('ORDER_ISSUE','PAYMENT','DELIVERY_AREA','BECOME_RIDER','PARTNERSHIP','OTHER');
CREATE TYPE "SupportStatus" AS ENUM ('NEW','IN_PROGRESS','RESOLVED');

CREATE TABLE "SupportRequest" (
  "id" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "whatsappNumber" TEXT,
  "email" TEXT,
  "orderCode" TEXT,
  "category" "SupportCategory" NOT NULL DEFAULT 'OTHER',
  "message" TEXT NOT NULL,
  "status" "SupportStatus" NOT NULL DEFAULT 'NEW',
  "handledByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportRequest_status_idx" ON "SupportRequest"("status");
CREATE INDEX "SupportRequest_createdAt_idx" ON "SupportRequest"("createdAt");
