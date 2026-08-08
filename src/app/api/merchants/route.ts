import { NextRequest, NextResponse } from "next/server";
import { isOwnStorage } from "@/lib/uploads/mediaSrc";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { buildSearchKey } from "@/lib/locations/normalize";
import { missingForMerchant, describeMissing } from "@/lib/merchants/complete";

/**
 * GET /api/merchants — public: verified merchants for the pickup picker.
 *
 * Capped and ranked rather than exhaustive: the catalogue runs to hundreds of
 * places, and a picker that ships all of them is slower and no more useful.
 * Anything more specific goes through /api/merchants/search.
 */
export async function GET() {
  const merchants = await prisma.merchant.findMany({
    where: { verified: true, active: true, acceptingOrders: true },
    orderBy: [{ popularityRank: "desc" }, { merchantName: "asc" }],
    take: 100,
    select: {
      id: true,
      merchantName: true,
      category: true,
      address: true,
      landmark: true,
      neighbourhood: true,
      openingHours: true,
      nightOpen: true,
      open24h: true,
      latitude: true,
      longitude: true,
    },
  });
  return NextResponse.json({ merchants });
}


/**
 * Image columns a merchant record carries, and the rule they answer to.
 *
 * Staff paste these too, so the same guard applies on the admin path as on the
 * merchant's own: an absolute URL here renders inside an `<img src>` on the
 * public food page, and pointing that at a third party turns our storefront
 * into somebody else's analytics.
 */
const IMAGE_FIELDS = ["logoUrl", "photoUrl"] as const;

function badImageField(body: Record<string, unknown>): string | null {
  for (const field of IMAGE_FIELDS) {
    if (!(field in body)) continue;
    const value = body[field];
    if (value === null || value === undefined || value === "") continue;
    if (typeof value !== "string" || !isOwnStorage(value)) return field;
  }
  return null;
}

const MERCHANT_FIELDS = [
  "merchantName",
  "category",
  "subcategory",
  "whatsappNumber",
  "phone",
  "address",
  "landmark",
  "neighbourhood",
  "latitude",
  "longitude",
  "zoneId",
  "openingHours",
  "nightOpen",
  "open24h",
  "acceptingOrders",
  "website",
  "socialUrl",
  "socialPlatform",
  "logoUrl",
  // The cover photo behind a restaurant card. It was read by the food page and
  // writable by nothing — the card had a slot no screen in the product could
  // fill, so every cover was going to stay empty forever.
  "photoUrl",
  "notes",
  "verified",
  "active",
];

/** POST /api/merchants — staff: create a merchant. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  // One rule, shared with the panels, so a disabled button and a 400 can never
  // mean different things. It used to demand a street address — which Yaoundé
  // businesses do not have — and that is why the catalogue could not be filled.
  const missing = missingForMerchant(body);
  if (missing.length > 0) {
    return NextResponse.json({ error: describeMissing(missing), missing }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  const bad = badImageField(body);
  if (bad) {
    return NextResponse.json(
      { error: `${bad} has to be a picture uploaded here, not a link somewhere else.` },
      { status: 400 }
    );
  }
  for (const k of MERCHANT_FIELDS) if (k in body) data[k] = body[k];
  // Keep the fuzzy search index in step with the name, the same way the
  // location catalogue does.
  data.searchKey = buildSearchKey(String(body.merchantName), []);
  data.source = "admin";
  const merchant = await prisma.merchant.create({ data: data as never });
  return NextResponse.json({ merchant }, { status: 201 });
}
