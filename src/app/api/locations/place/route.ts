import { NextRequest, NextResponse } from "next/server";
import { placeDetails } from "@/lib/maps/google";
import { nearestZone } from "@/lib/orders/pricing";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/locations/place?id=…&session=… — coordinates for a picked suggestion.
 *
 * This is the one billable call in the address flow, and it is what makes all
 * the typing before it free: Google charges a session at the moment it is
 * closed, so we must call this **once**, with the same token the suggestions
 * were fetched under, and only when somebody has actually chosen something.
 *
 * It also resolves the zone here rather than on the client, so a Google address
 * arrives with the same tier and fee any catalogue address would — the customer
 * should never see a different price for having typed a street instead of
 * picking a landmark.
 */
export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get("id") ?? "";
  const session = req.nextUrl.searchParams.get("session") ?? "";
  if (!placeId || !session) {
    return NextResponse.json({ error: "id and session are required" }, { status: 400 });
  }

  const point = await placeDetails(placeId, session);
  // Not an error the customer should see: the field falls back to letting them
  // drop a pin or type the address themselves.
  if (!point) return NextResponse.json({ found: false }, { status: 404 });

  const zones = await prisma.zone.findMany({
    where: { active: true, centroidLat: { not: null }, centroidLng: { not: null } },
    select: { id: true, zoneName: true, tier: true, feeXaf: true, centroidLat: true, centroidLng: true },
  });
  const zone = nearestZone(point.latitude, point.longitude, zones);

  return NextResponse.json({
    found: true,
    latitude: point.latitude,
    longitude: point.longitude,
    displayName: point.displayName,
    formattedAddress: point.formattedAddress,
    zoneId: zone?.id ?? null,
  });
}
