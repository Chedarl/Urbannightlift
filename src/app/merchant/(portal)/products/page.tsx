import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentMerchant } from "@/lib/auth/merchant";
import { MerchantProductsEditor } from "@/components/merchant/MerchantProductsEditor";

export const dynamic = "force-dynamic";

/**
 * The shop's own price list.
 *
 * This is the screen that removes the phone call. Before it, a merchant who
 * raised a price had to reach the owner, who then had to open the admin console
 * — so in practice prices went stale and customers guessed at a budget, which is
 * exactly what the original review complained about.
 */
export default async function MerchantProductsPage() {
  const merchant = await getCurrentMerchant();
  if (!merchant) redirect("/merchant/login");

  const products = await prisma.merchantProduct.findMany({
    where: { merchantId: merchant.id },
    orderBy: [{ popularityRank: "desc" }, { name: "asc" }],
    select: { id: true, name: true, priceXaf: true, unit: true, available: true, photoUrl: true },
  });

  return <MerchantProductsEditor initial={products} />;
}
