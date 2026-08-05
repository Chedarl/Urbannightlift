import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOperatingSettings } from "@/lib/settings";
import { yaoundeHour } from "@/lib/orders/tonight";
import { isOpenNow, isOnDuty, rankPharmacies } from "@/lib/pharmacy/tonight";

export const dynamic = "force-dynamic";

/**
 * The pharmacies a customer can actually be sent to tonight.
 *
 * The medicine form already searches the catalogue, and that is the right tool
 * when you know the name. At 1 AM you do not. The question is "who is open",
 * and the answer is published weekly by the Ordre des Pharmaciens as the
 * *pharmacie de garde* rotation — which this product has been storing in
 * `PharmacyDuty` and using to rank a search nobody performs, rather than simply
 * showing.
 *
 * So this is the same shape as the food browse route, with one difference that
 * matters more than everything else here:
 *
 * **Prescription medicines are not browsable.** Only products a person has
 * ticked as over-the-counter (`otcApproved`, default false) are ever returned.
 * A pharmacy's photographed price list contains prescription drugs; publishing
 * it the way a menu is published would put a controlled medicine in front of a
 * customer as a priced row with a plus button, which is not ours to do. The
 * prescription route stays exactly as it is: upload it, no prices, no cart, the
 * pharmacist decides.
 */

export interface ShelfItem {
  id: string;
  name: string;
  nameFr: string | null;
  priceXaf: number | null;
  unit: string | null;
  category: string | null;
  description: string | null;
}

export interface BrowsePharmacy {
  id: string;
  name: string;
  neighbourhood: string | null;
  address: string | null;
  landmark: string | null;
  latitude: number | null;
  longitude: number | null;
  zoneId: string | null;
  phone: string | null;
  logoUrl: string | null;
  nightOpen: boolean;
  open24h: boolean;
  openNow: boolean;
  onDutyTonight: boolean;
  /** Over-the-counter only. Never a prescription medicine. */
  shelf: ShelfItem[];
}

export async function GET() {
  const settings = await getOperatingSettings();
  const now = new Date();
  const hour = yaoundeHour(now);

  const [merchants, duty] = await Promise.all([
    prisma.merchant.findMany({
      where: {
        category: "PHARMACY",
        // The same four conditions the food page uses, and none of them is
        // optional: an unverified pharmacy is one nobody has confirmed exists.
        verified: true,
        active: true,
        acceptingOrders: true,
      },
      take: 60,
      select: {
        id: true,
        merchantName: true,
        neighbourhood: true,
        address: true,
        landmark: true,
        latitude: true,
        longitude: true,
        zoneId: true,
        phone: true,
        whatsappNumber: true,
        logoUrl: true,
        nightOpen: true,
        open24h: true,
        products: {
          // The line that keeps a controlled medicine off a browsing page.
          where: { available: true, otcApproved: true },
          orderBy: [{ popularityRank: "desc" }, { name: "asc" }],
          take: 40,
          select: {
            id: true,
            name: true,
            nameFr: true,
            priceXaf: true,
            unit: true,
            category: true,
            description: true,
          },
        },
      },
    }),
    prisma.pharmacyDuty.findMany({ select: { merchantId: true, startsOn: true, endsOn: true } }),
  ]);

  const onDuty = new Set(duty.filter((d) => isOnDuty(d, now)).map((d) => d.merchantId));

  const rows: BrowsePharmacy[] = merchants.map((m) => ({
    id: m.id,
    name: m.merchantName,
    neighbourhood: m.neighbourhood,
    address: m.address,
    landmark: m.landmark,
    latitude: m.latitude,
    longitude: m.longitude,
    zoneId: m.zoneId,
    phone: m.phone?.trim() || m.whatsappNumber?.trim() || null,
    logoUrl: m.logoUrl,
    nightOpen: m.nightOpen,
    open24h: m.open24h,
    openNow: isOpenNow(m, hour, settings.operatingStartHour, settings.operatingEndHour),
    onDutyTonight: onDuty.has(m.id),
    shelf: m.products,
  }));

  return NextResponse.json({
    pharmacies: rankPharmacies(rows),
    total: rows.length,
    // Said plainly so the page can explain itself rather than look broken when
    // the catalogue has nobody in it yet.
    openCount: rows.filter((r) => r.openNow || r.onDutyTonight).length,
  });
}
