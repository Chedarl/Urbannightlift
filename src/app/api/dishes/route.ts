import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/dishes — the "popular tonight" suggestions.
 *
 * Indicative price ranges for common Yaoundé night dishes, deliberately tied to
 * no merchant. A newly catalogued restaurant has no product list, and without
 * something to tap the customer is back to inventing a budget from nothing —
 * the complaint that started this work. These are labelled as indicative
 * wherever they appear; a firm price only ever comes from a merchant's own list.
 */
export async function GET() {
  const dishes = await prisma.popularDish.findMany({
    where: { active: true },
    orderBy: { popularityRank: "desc" },
    take: 24,
    select: { id: true, nameEn: true, nameFr: true, priceMinXaf: true, priceMaxXaf: true },
  });
  return NextResponse.json({ dishes });
}
