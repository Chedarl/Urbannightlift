-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'DISPATCHER', 'RIDER', 'SUPPORT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PreferredLanguage" AS ENUM ('EN', 'FR');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('FOOD_PICKUP', 'MEDICINE_PICKUP', 'GROCERY_PICKUP', 'SMALL_PARCEL', 'URGENT_ITEM', 'CUSTOM_ERRAND', 'MERCHANT_DELIVERY');

-- CreateEnum
CREATE TYPE "PrescriptionRequired" AS ENUM ('YES', 'NO', 'NOT_SURE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('MTN_MOMO', 'ORANGE_MONEY');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AWAITING_CUSTOMER_PAYMENT', 'SUBMITTED_UNVERIFIED', 'VERIFIED', 'FAILED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('MANUAL', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW_REQUEST', 'AWAITING_DISPATCHER_REVIEW', 'APPROVED', 'REJECTED', 'AWAITING_PAYMENT', 'PAYMENT_SUBMITTED', 'PAYMENT_VERIFIED', 'RIDER_ASSIGNED', 'RIDER_GOING_TO_PICKUP', 'RIDER_ARRIVED_AT_PICKUP', 'ITEM_COLLECTED', 'RIDER_GOING_TO_DELIVERY', 'RIDER_ARRIVED_AT_DELIVERY', 'DELIVERY_PROOF_SUBMITTED', 'DELIVERED', 'CLOSED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_UNL', 'FAILED_DELIVERY', 'CUSTOMER_UNREACHABLE', 'MERCHANT_UNAVAILABLE', 'SAFETY_HOLD', 'REFUND_PENDING', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SafetyLevel" AS ENUM ('SAFE', 'CAUTION', 'RESTRICTED', 'NO_GO');

-- CreateEnum
CREATE TYPE "MerchantCategory" AS ENUM ('FOOD', 'PHARMACY', 'GROCERY', 'GENERAL_STORE', 'OTHER');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('CUSTOMER_COMPLAINT', 'RIDER_ISSUE', 'MERCHANT_ISSUE', 'PAYMENT_ISSUE', 'DAMAGED_ITEM', 'MISSING_ITEM', 'LATE_DELIVERY', 'SAFETY_CONCERN', 'WRONG_ADDRESS', 'CUSTOMER_UNREACHABLE');

-- CreateEnum
CREATE TYPE "IncidentResolutionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'ESCALATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ResponsibleParty" AS ENUM ('RIDER', 'CUSTOMER', 'MERCHANT', 'DISPATCH', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "OperatingMode" AS ENUM ('OPEN', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProofMethod" AS ENUM ('OTP', 'PHOTO', 'BOTH');

-- CreateEnum
CREATE TYPE "ProofStage" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "authUserId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "whatsappNumber" TEXT NOT NULL,
    "alternativePhone" TEXT,
    "preferredLanguage" "PreferredLanguage" NOT NULL DEFAULT 'EN',
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "zoneName" TEXT NOT NULL,
    "description" TEXT,
    "feeXaf" INTEGER NOT NULL,
    "nearbyFeeXaf" INTEGER,
    "extendedFeeXaf" INTEGER,
    "nightUrgencyFeeXaf" INTEGER NOT NULL DEFAULT 0,
    "medicineFeeXaf" INTEGER NOT NULL DEFAULT 0,
    "waitingFeeXaf" INTEGER NOT NULL DEFAULT 0,
    "safetyLevel" "SafetyLevel" NOT NULL DEFAULT 'SAFE',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "category" "MerchantCategory" NOT NULL,
    "whatsappNumber" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT NOT NULL,
    "landmark" TEXT,
    "openingHours" TEXT,
    "notes" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderCode" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "pickupLocation" TEXT NOT NULL,
    "pickupLandmark" TEXT,
    "pickupZoneId" TEXT,
    "deliveryLocation" TEXT NOT NULL,
    "deliveryLandmark" TEXT,
    "deliveryZoneId" TEXT,
    "merchantId" TEXT,
    "itemDescription" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "declaredValueXaf" INTEGER NOT NULL,
    "isFragile" BOOLEAN NOT NULL DEFAULT false,
    "needsTemperatureCare" BOOLEAN NOT NULL DEFAULT false,
    "isMedicine" BOOLEAN NOT NULL DEFAULT false,
    "prescriptionRequired" "PrescriptionRequired",
    "itemAlreadyPaid" BOOLEAN NOT NULL DEFAULT false,
    "riderPaysAtPickup" BOOLEAN NOT NULL DEFAULT false,
    "preferredDeliveryTime" TEXT,
    "specialInstructions" TEXT,
    "estimatedDeliveryFeeXaf" INTEGER,
    "finalDeliveryFeeXaf" INTEGER,
    "totalAmountDueXaf" INTEGER,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "orderStatus" "OrderStatus" NOT NULL DEFAULT 'NEW_REQUEST',
    "assignedRiderId" TEXT,
    "riskFlag" BOOLEAN NOT NULL DEFAULT false,
    "highValueFlag" BOOLEAN NOT NULL DEFAULT false,
    "rejectionReason" TEXT,
    "adminNotes" TEXT,
    "customerVisibleNotes" TEXT,
    "screenshotUrl" TEXT,
    "otpCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "amountXaf" INTEGER NOT NULL,
    "paymentPhone" TEXT,
    "transactionReference" TEXT,
    "providerReference" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "verificationMethod" "VerificationMethod" NOT NULL DEFAULT 'MANUAL',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "changedByUserId" TEXT,
    "changedByRole" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryProof" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "stage" "ProofStage" NOT NULL,
    "proofMethod" "ProofMethod" NOT NULL,
    "otpEntered" TEXT,
    "photoUrl" TEXT,
    "riderNote" TEXT,
    "submittedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "incidentType" "IncidentType" NOT NULL,
    "description" TEXT NOT NULL,
    "responsibleParty" "ResponsibleParty" NOT NULL DEFAULT 'UNKNOWN',
    "resolutionStatus" "IncidentResolutionStatus" NOT NULL DEFAULT 'OPEN',
    "internalNotes" TEXT,
    "reportedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatingSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "mode" "OperatingMode" NOT NULL DEFAULT 'CLOSED',
    "operatingStartHour" INTEGER NOT NULL DEFAULT 20,
    "operatingEndHour" INTEGER NOT NULL DEFAULT 24,
    "zoneNoticeEn" TEXT,
    "zoneNoticeFr" TEXT,
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_authUserId_key" ON "User"("authUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Customer_whatsappNumber_idx" ON "Customer"("whatsappNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_zoneName_key" ON "Zone"("zoneName");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderCode_key" ON "Order"("orderCode");

-- CreateIndex
CREATE INDEX "Order_orderStatus_idx" ON "Order"("orderStatus");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_assignedRiderId_idx" ON "Order"("assignedRiderId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_idx" ON "OrderStatusHistory"("orderId");

-- CreateIndex
CREATE INDEX "DeliveryProof_orderId_idx" ON "DeliveryProof"("orderId");

-- CreateIndex
CREATE INDEX "Incident_resolutionStatus_idx" ON "Incident"("resolutionStatus");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_pickupZoneId_fkey" FOREIGN KEY ("pickupZoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_assignedRiderId_fkey" FOREIGN KEY ("assignedRiderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryProof" ADD CONSTRAINT "DeliveryProof_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
