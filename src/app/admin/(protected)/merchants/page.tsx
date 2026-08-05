import { prisma } from "@/lib/prisma";
import { MerchantsManager } from "@/components/admin/MerchantsManager";
import { WelcomeQueue } from "@/components/admin/WelcomeQueue";
import { normalizeLoose } from "@/lib/locations/normalize";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

/**
 * Two lists, not one.
 *
 * The catalogue holds hundreds of places imported from OpenStreetMap, so
 * loading them all into one page would be unusable and would blur the only
 * distinction that matters: a merchant customers can order from versus one
 * nobody has called yet. The queue is the default view, because working
 * through it is what turns imported rows into a usable catalogue.
 */
export default async function MerchantsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>;
}) {
  const { tab = "queue", q = "", page = "1" } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const search = q.trim();

  const where: Prisma.MerchantWhereInput = {
    ...(tab === "live" ? { verified: true, active: true } : {}),
    ...(tab === "queue" ? { verified: false } : {}),
    // The duty tab renders the roster, not the merchant list — keep its query cheap.
    ...(tab === "duty" ? { id: "" } : {}),
    ...(search
      ? {
          OR: [
            { merchantName: { contains: search, mode: "insensitive" } },
            { searchKey: { contains: normalizeLoose(search) } },
            { neighbourhood: { contains: search, mode: "insensitive" } },
            { address: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const now = new Date();
  const [merchants, total, counts, onDuty, pharmacies] = await Promise.all([
    prisma.merchant.findMany({
      where,
      include: {
        products: {
          where: { available: true },
          orderBy: [{ popularityRank: "desc" }, { name: "asc" }],
          select: { id: true, name: true, priceXaf: true, otcApproved: true },
        },
      },
      // A business that filled in its own page answered us, which is the best
      // lead there is; then whoever was seen trading most recently.
      orderBy: [
        { verified: "desc" },
        { lastSeenActiveAt: "desc" },
        { popularityRank: "desc" },
        { merchantName: "asc" },
      ],
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.merchant.count({ where }),
    Promise.all([
      prisma.merchant.count({ where: { verified: true, active: true } }),
      prisma.merchant.count({ where: { verified: false } }),
    ]),
    // Cameroon's night pharmacy duty rotates weekly, so this is whoever is on
    // duty right now rather than a permanent property of a pharmacy.
    prisma.pharmacyDuty.findMany({
      where: { endsOn: { gte: now } },
      include: { merchant: { select: { merchantName: true } } },
      orderBy: { endsOn: "asc" },
    }),
    prisma.merchant.findMany({
      where: { category: "PHARMACY", verified: true, active: true },
      orderBy: { merchantName: "asc" },
      select: { id: true, merchantName: true, neighbourhood: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      {/* A business that filled in the form itself is trading tonight and is
          the best lead in this list. Welcoming it is the cheapest thing we can
          do with that. Renders nothing when nobody is waiting. */}
      <WelcomeQueue kind="merchant" />
      <MerchantsManager
        merchants={merchants.map((m) => ({
          id: m.id,
          merchantName: m.merchantName,
          category: m.category,
          subcategory: m.subcategory,
          whatsappNumber: m.whatsappNumber,
          phone: m.phone,
          address: m.address,
          landmark: m.landmark,
          neighbourhood: m.neighbourhood,
          latitude: m.latitude,
          longitude: m.longitude,
          openingHours: m.openingHours,
          nightOpen: m.nightOpen,
          open24h: m.open24h,
          acceptingOrders: m.acceptingOrders,
          website: m.website,
          notes: m.notes,
          source: m.source,
          socialUrl: m.socialUrl,
          socialPlatform: m.socialPlatform,
          logoUrl: m.logoUrl,
          verified: m.verified,
          active: m.active,
          phoneVerifiedAt: m.phoneVerifiedAt?.toISOString() ?? null,
          lastConfirmedAt: m.lastConfirmedAt?.toISOString() ?? null,
          availabilityCheckedAt: m.availabilityCheckedAt?.toISOString() ?? null,
          // Whether the business has claimed its own login. Never the hash
          // itself — the console has no business holding a password digest.
          hasLogin: m.pinHash != null,
          products: m.products,
        }))}
        onDuty={onDuty.map((d) => ({
          id: d.id,
          merchantId: d.merchantId,
          merchantName: d.merchant.merchantName,
          endsOn: d.endsOn.toISOString(),
        }))}
        pharmacies={pharmacies}
        tab={tab === "live" ? "live" : tab === "all" ? "all" : tab === "duty" ? "duty" : "queue"}
        query={search}
        page={pageNum}
        pageSize={PAGE_SIZE}
        total={total}
        liveCount={counts[0]}
        queueCount={counts[1]}
      />
    </div>
  );
}
