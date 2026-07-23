import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";

/** GET /api/merchants — public: verified + active merchants for pickup choice. */
export async function GET() {
  const merchants = await prisma.merchant.findMany({
    where: { verified: true, active: true },
    orderBy: { merchantName: "asc" },
    select: {
      id: true,
      merchantName: true,
      category: true,
      address: true,
      landmark: true,
      openingHours: true,
    },
  });
  return NextResponse.json({ merchants });
}

const MERCHANT_FIELDS = [
  "merchantName",
  "category",
  "whatsappNumber",
  "phone",
  "address",
  "landmark",
  "openingHours",
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
  const merchant = await prisma.merchant.create({ data: data as never });
  return NextResponse.json({ merchant }, { status: 201 });
}
