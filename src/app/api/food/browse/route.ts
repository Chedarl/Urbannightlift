import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOperatingSettings } from "@/lib/settings";
import { yaoundeHour } from "@/lib/orders/tonight";

export const dynamic = "force-dynamic";

/**
 * The restaurants a customer can actually order from tonight, with what they
 * actually sell.
 *
 * This replaces three hardcoded restaurants — names, addresses, ratings, menus
 * and prices, all invented, illustrated with stock photography. They were live
 * on the food order page, which meant a customer could order a named dish at a
 * named price from a business that may not exist, and a rider would be sent to
 * an invented street to collect it.
 *
 * That is the same failure the OpenStreetMap import caused and that v12 deleted
 * the whole catalogue over, except worse: that import at least contained real
 * places that had closed. This invented the places.
 *
 * So the rule here is the one the catalogue has always had, and it is the only
 * thing standing between a browsing page and that failure happening again:
 * **nothing appears unless a human verified the business exists.** An empty
 * page is a correct page when nobody has been verified yet.
 */

export interface FoodItem {
  id: string;
  name: string;
  nameFr: string | null;
  priceXaf: number | null;
  unit: string | null;
  photoUrl: string | null;
}

export interface FoodMerchant {
  id: string;
  name: string;
  neighbourhood: string | null;
  address: string | null;
  logoUrl: string | null;
  photoUrl: string | null;
  openNow: boolean;
  open24h: boolean;
  items: FoodItem[];
}

export async function GET() {
  const settings = await getOperatingSettings();
  const hour = yaoundeHour();
  // The same wrap-past-midnight arithmetic the rest of the product uses, so the
  // browse page and the open/closed badge cannot disagree.
  const start = settings.operatingStartHour;
  const end = settings.operatingEndHour;
  const isNight = start <= end ? hour >= start && hour < end : hour >= start || hour < end;

  const merchants = await prisma.merchant.findMany({
    where: {
      category: "FOOD",
      // All four, and none of them is optional. Verified means somebody
      // confirmed it exists; acceptingOrders means it is taking orders tonight.
      verified: true,
      active: true,
      acceptingOrders: true,
    },
    orderBy: [{ popularityRank: "desc" }, { merchantName: "asc" }],
    take: 60,
    select: {
      id: true,
      merchantName: true,
      neighbourhood: true,
      address: true,
      logoUrl: true,
      photoUrl: true,
      nightOpen: true,
      open24h: true,
      products: {
        where: { available: true },
        orderBy: [{ popularityRank: "desc" }, { name: "asc" }],
        take: 40,
        select: {
          id: true,
          name: true,
          nameFr: true,
          priceXaf: true,
          unit: true,
          photoUrl: true,
        },
      },
    },
  });

  const rows: FoodMerchant[] = merchants.map((m) => ({
    id: m.id,
    name: m.merchantName,
    neighbourhood: m.neighbourhood,
    address: m.address,
    logoUrl: m.logoUrl,
    photoUrl: m.photoUrl,
    openNow: m.open24h || (isNight && m.nightOpen),
    open24h: m.open24h,
    items: m.products,
  }));

  return NextResponse.json({
    // Open first — at 1 AM the only question is who is actually cooking.
    merchants: [...rows].sort((a, b) => Number(b.openNow) - Number(a.openNow)),
    // Told plainly rather than implied by an empty list, so the page can say
    // something honest instead of looking broken.
    total: rows.length,
  });
}
