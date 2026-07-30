import { redirect } from "next/navigation";
import { getCurrentMerchant } from "@/lib/auth/merchant";
import { sellTonight } from "@/lib/merchants/sellTonight";
import { merchantOrderFacts } from "@/lib/merchants/orderFacts";
import { MerchantInsights } from "@/components/merchant/MerchantInsights";

export const dynamic = "force-dynamic";

/**
 * The merchant's own sales picture — the thing no other courier here gives them.
 *
 * Everyone else moves a shop's goods and hands them a payout. We already know
 * which of their items actually sell, which nights are dead, and whether their
 * orders are growing or fading, because every order carries a `merchantId` and
 * structured items. Handing that back is what makes us infrastructure for a
 * small business rather than a delivery van.
 *
 * It reads exactly the same computation the desk reads, so a merchant is never
 * told one thing on their phone while support is looking at another.
 */
export default async function MerchantInsightsPage() {
  const merchant = await getCurrentMerchant();
  if (!merchant) redirect("/merchant/login");

  const report = sellTonight(await merchantOrderFacts(merchant.id), new Date());
  return <MerchantInsights report={report} />;
}
