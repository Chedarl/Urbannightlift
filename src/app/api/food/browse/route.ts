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
  /** What the board groups it under — BROCHETTES, POULET. Drives the strip. */
  category: string | null;
  /** One short line, so the grid reads like a menu rather than a stock take. */
  description: string | null;
  descriptionFr: string | null;
  /** They told us it ran out. Shown as out, never quietly removed. */
  soldOut: boolean;
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
  /**
   * Where the rider is actually going.
   *
   * These were not sent, and the food form quietly nulled the pickup pin on the
   * catalogue path because of it — `pricing.ts` measures road distance from
   * exactly these two numbers, so the path we most want people to use was the
   * one priced from a zone guess. The merchant picker on the medicine page has
   * always sent them; this is the same data, on the other screen.
   */
  latitude: number | null;
  longitude: number | null;
  landmark: string | null;
  /** So `merchantToLocation` can set a contact at the pickup end. */
  phone: string | null;
  /**
   * When this restaurant last told us what they actually have.
   *
   * The differentiator, rendered as "confirmed 12 minutes ago". Everywhere else
   * you order a dish and find out it ran out when the rider arrives.
   */
  checkedAt: string | null;
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
      latitude: true,
      longitude: true,
      landmark: true,
      phone: true,
      whatsappNumber: true,
      nightOpen: true,
      open24h: true,
      availabilityCheckedAt: true,
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
          category: true,
          description: true,
          descriptionFr: true,
          soldOutAt: true,
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
    latitude: m.latitude,
    longitude: m.longitude,
    landmark: m.landmark,
    phone: m.phone ?? m.whatsappNumber,
    openNow: m.open24h || (isNight && m.nightOpen),
    open24h: m.open24h,
    checkedAt: m.availabilityCheckedAt?.toISOString() ?? null,
    // Sold-out items are sent, not filtered out. "They ran out tonight" is
    // information a customer wants — silently removing the dish they came for
    // reads as us not having it at all, which is a different and worse message.
    items: m.products.map((p) => ({
      id: p.id,
      name: p.name,
      nameFr: p.nameFr,
      priceXaf: p.priceXaf,
      unit: p.unit,
      photoUrl: p.photoUrl,
      category: p.category,
      description: p.description,
      descriptionFr: p.descriptionFr,
      soldOut: p.soldOutAt != null,
    })),
  }));

  return NextResponse.json({
    // Open first — at 1 AM the only question is who is actually cooking.
    merchants: [...rows].sort((a, b) => Number(b.openNow) - Number(a.openNow)),
    // Told plainly rather than implied by an empty list, so the page can say
    // something honest instead of looking broken.
    total: rows.length,
  });
}
