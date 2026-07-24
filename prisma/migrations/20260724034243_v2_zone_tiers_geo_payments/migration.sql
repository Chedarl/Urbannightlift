-- CreateEnum
CREATE TYPE "ZoneTier" AS ENUM ('GREEN', 'YELLOW', 'RED');

-- AlterTable
ALTER TABLE "OperatingSettings" ADD COLUMN     "mtnMerchantCode" TEXT,
ADD COLUMN     "orangeMerchantCode" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryAddressLabel" TEXT,
ADD COLUMN     "deliveryLat" DOUBLE PRECISION,
ADD COLUMN     "deliveryLng" DOUBLE PRECISION,
ADD COLUMN     "pickupAddressLabel" TEXT,
ADD COLUMN     "pickupLat" DOUBLE PRECISION,
ADD COLUMN     "pickupLng" DOUBLE PRECISION,
ADD COLUMN     "riderLat" DOUBLE PRECISION,
ADD COLUMN     "riderLng" DOUBLE PRECISION,
ADD COLUMN     "riderLocationAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Zone" ADD COLUMN     "centroidLat" DOUBLE PRECISION,
ADD COLUMN     "centroidLng" DOUBLE PRECISION,
ADD COLUMN     "tier" "ZoneTier" NOT NULL DEFAULT 'GREEN';
