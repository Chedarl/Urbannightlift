import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { buildSearchKey } from "@/lib/locations/normalize";

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
  if (!body.merchantName || !body.category || !body.whatsappNumber || !body.address) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  for (const k of MERCHANT_FIELDS) if (k in body) data[k] = body[k];
  // Keep the fuzzy search index in step with the name, the same way the
  // location catalogue does.
  data.searchKey = buildSearchKey(String(body.merchantName), []);
  data.source = "admin";
  const merchant = await prisma.merchant.create({ data: data as never });
  return NextResponse.json({ merchant }, { status: 201 });
}
