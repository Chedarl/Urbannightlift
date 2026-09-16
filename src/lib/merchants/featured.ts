import "server-only";

import type { MerchantCategory } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getOperatingSettings } from "@/lib/settings";
import { yaoundeHour } from "@/lib/orders/tonight";
import type { BusinessCardData } from "@/components/customer/business/BusinessCard";

/**
 * A featured business, with the freshness left as a timestamp.
 *
 * Not worded here. The line is the one thing on this card whose wording depends
 * on the clock *and* on the reader's language, and a server component knows the
 * first but not the second — wording it here would ship "confirmed 12 minutes
 * ago" to a French reader. The hub is a client component and words it there,
 * through the same `freshLabel` the food list uses, so the two agree.
 */
export type FeaturedMerchant = Omit<BusinessCardData, "freshness"> & {
  checkedAt: string | null;
};

/**
 * A few real businesses to put on the hub, per service.
 *
 * ## Why this is a query and not a fixture
 *
 * The obvious way to make a landing page look alive is to put some names on it.
 * The prototype this design came from does exactly that, from a file of sixty
 * businesses with invented phone numbers and ratings. This product shipped that
 * mistake for real in v49 — three restaurants with fabricated menus and stock
 * photography, live, orderable — and had to take it out again.
 *
 * So the hub shows what the catalogue actually holds, and when the catalogue
 * holds nothing the section is not rendered at all. An empty page is a correct
 * page while the calling is still being done, and the service tiles underneath
 * have always worked.
 *
 * The same four conditions as every other customer-facing list: verified,
 * active, accepting orders, and ranked by popularity. A merchant auto-created
 * from a customer's order has none of the first three and cannot appear here.
 */
export async function featuredMerchants(
  category: MerchantCategory,
  take = 3
): Promise<FeaturedMerchant[]> {
  const settings = await getOperatingSettings();
  const hour = yaoundeHour();
  const start = settings.operatingStartHour;
  const end = settings.operatingEndHour;
  // The same wrap-past-midnight arithmetic as `/api/food/browse`, so the hub
  // and the list it links to cannot disagree about who is open.
  const isNight = start <= end ? hour >= start && hour < end : hour >= start || hour < end;

  const rows = await prisma.merchant.findMany({
    where: { category, verified: true, active: true, acceptingOrders: true },
    orderBy: [{ popularityRank: "desc" }, { merchantName: "asc" }],
    take,
    select: {
      id: true,
      merchantName: true,
      neighbourhood: true,
      address: true,
      logoUrl: true,
      nightOpen: true,
      open24h: true,
      availabilityCheckedAt: true,
      _count: { select: { products: { where: { available: true } } } },
    },
  });

  return rows.map((m) => ({
    id: m.id,
    name: m.merchantName,
    where: m.neighbourhood ?? m.address,
    verified: true,
    openNow: m.open24h || (isNight && m.nightOpen),
    logoUrl: m.logoUrl,
    itemCount: m._count.products,
    checkedAt: m.availabilityCheckedAt?.toISOString() ?? null,
  }));
}
