import { redirect } from "next/navigation";
import { getCurrentMerchant } from "@/lib/auth/merchant";
import { MerchantShell } from "@/components/merchant/MerchantShell";

export const dynamic = "force-dynamic";

/**
 * The gate every merchant screen sits behind.
 *
 * Middleware already checks the cookie, but it runs on the Edge and cannot
 * reach Prisma — so it can only prove somebody holds a valid token, not that
 * the business is still verified and active. This is where that is checked,
 * exactly as the admin and rider route groups do it, so un-verifying a merchant
 * takes their access away on their next page load rather than in ninety days.
 */
export default async function MerchantPortalLayout({ children }: { children: React.ReactNode }) {
  const merchant = await getCurrentMerchant();
  if (!merchant) redirect("/merchant/login");

  return <MerchantShell merchantName={merchant.merchantName}>{children}</MerchantShell>;
}
