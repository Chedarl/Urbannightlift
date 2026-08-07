import { redirect } from "next/navigation";
import { getCurrentMerchant } from "@/lib/auth/merchant";
import { MerchantProfile } from "@/components/merchant/MerchantProfile";

export const dynamic = "force-dynamic";

export default async function MerchantProfilePage() {
  const merchant = await getCurrentMerchant();
  if (!merchant) redirect("/merchant/login");

  return (
    <MerchantProfile
      merchant={{
        merchantName: merchant.merchantName,
        category: merchant.category,
        address: merchant.address,
        landmark: merchant.landmark,
        phone: merchant.phone,
        whatsappNumber: merchant.whatsappNumber,
        openingHours: merchant.openingHours,
        nightOpen: merchant.nightOpen,
        open24h: merchant.open24h,
        website: merchant.website,
        socialUrl: merchant.socialUrl,
        logoUrl: merchant.logoUrl,
        photoUrl: merchant.photoUrl,
      }}
    />
  );
}
