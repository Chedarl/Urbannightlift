import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/locations — active catalogue for the "Browse areas" tab, grouped by
 * arrondissement (Yaoundé VI first). Priority locations rank highest within each.
 */
const ARR_ORDER = [
  "YAOUNDE_VI",
  "YAOUNDE_I",
  "YAOUNDE_II",
  "YAOUNDE_III",
  "YAOUNDE_IV",
  "YAOUNDE_V",
  "YAOUNDE_VII",
  "YAOUNDE_PERIPHERY",
];

export async function GET() {
  const locs = await prisma.serviceLocation.findMany({
    where: { active: true },
    orderBy: [{ popularityRank: "desc" }, { primaryName: "asc" }],
    select: {
      id: true,
      primaryName: true,
      neighbourhood: true,
      arrondissement: true,
      landmark: true,
      latitude: true,
      longitude: true,
      plusCode: true,
      serviceStatus: true,
    },
  });

  const groups = ARR_ORDER.map((arr) => ({
    arrondissement: arr,
    locations: locs.filter((l) => l.arrondissement === arr).map((l) => ({ ...l, source: "local" as const })),
  })).filter((g) => g.locations.length > 0);

  return NextResponse.json({ groups });
}
