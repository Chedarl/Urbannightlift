import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, ADMIN_ROLES } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { buildSearchKey, normalizeLoose } from "@/lib/locations/normalize";
import { nearestZone } from "@/lib/orders/pricing";

export const dynamic = "force-dynamic";

/**
 * The location catalogue — the one data source that beats Google in this city.
 *
 * Addresses in Yaoundé are landmarks, not postal lines: "behind the Total
 * station at Rond-Point Express, blue gate". No provider geocodes that, so the
 * catalogue is not a stopgap until we can afford a better API — it is the
 * better answer, and `resolveAddress` already ranks it above everything
 * external.
 *
 * Until now there was no way to change it. `ServiceLocation` appeared only in
 * the two public read routes; the 52 seeded rows could be edited by rewriting
 * `prisma/seed.ts` and redeploying, and by nothing else. So the one asset that
 * compounds was also the one nobody could add to.
 *
 * Every mutation is `ADMIN_ROLES` and audited. A location decides where a rider
 * is sent at 1 AM, which makes a wrong pin a wasted trip and a safety question,
 * not a typo.
 */

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();

  const locations = await prisma.serviceLocation.findMany({
    where: q
      ? {
          OR: [
            { primaryName: { contains: q, mode: "insensitive" } },
            { neighbourhood: { contains: q, mode: "insensitive" } },
            { searchKey: { contains: normalizeLoose(q) } },
          ],
        }
      : undefined,
    orderBy: [{ active: "desc" }, { popularityRank: "desc" }, { primaryName: "asc" }],
    take: 200,
    select: {
      id: true,
      primaryName: true,
      aliases: true,
      neighbourhood: true,
      arrondissement: true,
      landmark: true,
      latitude: true,
      longitude: true,
      zoneId: true,
      serviceStatus: true,
      active: true,
      popularityRank: true,
      source: true,
    },
  });

  return NextResponse.json({ locations });
}

/**
 * POST — add a place to the catalogue.
 *
 * Usually reached from the failing-addresses queue with the customer's own words
 * already in the box, which is why `rawText` is accepted and folded into the
 * aliases: the string that failed is exactly the string that should match next
 * time.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const primaryName = typeof body.primaryName === "string" ? body.primaryName.trim().slice(0, 160) : "";
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);

  if (primaryName.length < 2) {
    return NextResponse.json({ error: "Give the place a name." }, { status: 400 });
  }
  // A catalogue row with no pin is worse than no row: it would match a search
  // and then send a rider nowhere.
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: "Drop a pin on the map." }, { status: 400 });
  }

  const aliases = Array.isArray(body.aliases)
    ? [...new Set((body.aliases as unknown[]).filter((a): a is string => typeof a === "string" && a.trim().length > 1).map((a) => a.trim().slice(0, 160)))].slice(0, 12)
    : [];

  // The exact text that failed becomes an alias, so the next customer who types
  // it gets a hit rather than another guess.
  const rawText = typeof body.rawText === "string" ? body.rawText.trim().slice(0, 160) : "";
  if (rawText && rawText.toLowerCase() !== primaryName.toLowerCase() && !aliases.some((a) => a.toLowerCase() === rawText.toLowerCase())) {
    aliases.push(rawText);
  }

  // Zone from the pin, exactly as a customer's address gets it, so a catalogue
  // entry quotes the same fee the same place would quote any other way.
  const zones = await prisma.zone.findMany({
    where: { active: true, centroidLat: { not: null }, centroidLng: { not: null } },
    select: { id: true, zoneName: true, tier: true, feeXaf: true, centroidLat: true, centroidLng: true },
  });
  const zone = nearestZone(latitude, longitude, zones);

  const location = await prisma.serviceLocation.create({
    data: {
      primaryName,
      aliases,
      searchKey: buildSearchKey(primaryName, aliases),
      neighbourhood:
        typeof body.neighbourhood === "string" && body.neighbourhood.trim()
          ? body.neighbourhood.trim().slice(0, 120)
          : "Yaoundé",
      arrondissement: (typeof body.arrondissement === "string" ? body.arrondissement : "YAOUNDE_PERIPHERY") as never,
      landmark: typeof body.landmark === "string" && body.landmark.trim() ? body.landmark.trim().slice(0, 300) : null,
      latitude,
      longitude,
      zoneId: zone?.id ?? null,
      serviceStatus: (typeof body.serviceStatus === "string" ? body.serviceStatus : "STANDARD") as never,
      // Says where this came from. A place added off a real failed order is a
      // stronger entry than one somebody typed speculatively.
      source: typeof body.source === "string" ? body.source : "admin",
      active: true,
    },
  });

  await recordAudit({
    entityType: "location",
    entityId: location.id,
    entityLabel: location.primaryName,
    action: "LOCATION_ADDED",
    actor: user,
    reason: rawText ? `From a failed address: "${rawText.slice(0, 120)}"` : null,
  });

  return NextResponse.json({ location, zone: zone?.zoneName ?? null }, { status: 201 });
}

/** PATCH — edit or deactivate a catalogue entry. */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || !ADMIN_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Which place?" }, { status: 400 });

  const existing = await prisma.serviceLocation.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (typeof body.primaryName === "string" && body.primaryName.trim().length > 1) {
    data.primaryName = body.primaryName.trim().slice(0, 160);
  }
  if (Array.isArray(body.aliases)) {
    data.aliases = [...new Set((body.aliases as unknown[]).filter((a): a is string => typeof a === "string" && a.trim().length > 1).map((a) => a.trim().slice(0, 160)))].slice(0, 12);
  }
  if (typeof body.neighbourhood === "string" && body.neighbourhood.trim()) {
    data.neighbourhood = body.neighbourhood.trim().slice(0, 120);
  }
  if (typeof body.landmark === "string") {
    data.landmark = body.landmark.trim().slice(0, 300) || null;
  }
  if (typeof body.arrondissement === "string") data.arrondissement = body.arrondissement;
  if (typeof body.serviceStatus === "string") data.serviceStatus = body.serviceStatus;
  if (typeof body.active === "boolean") data.active = body.active;
  if (typeof body.popularityRank === "number") {
    data.popularityRank = Math.max(0, Math.min(1000, Math.round(body.popularityRank)));
  }

  const lat = Number(body.latitude);
  const lng = Number(body.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    data.latitude = lat;
    data.longitude = lng;
    const zones = await prisma.zone.findMany({
      where: { active: true, centroidLat: { not: null }, centroidLng: { not: null } },
      select: { id: true, zoneName: true, tier: true, feeXaf: true, centroidLat: true, centroidLng: true },
    });
    data.zoneId = nearestZone(lat, lng, zones)?.id ?? null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }

  // The search key is derived, never sent by the client — otherwise the admin
  // screen and the public search could rank the same row differently.
  const name = (data.primaryName as string) ?? existing.primaryName;
  const aliases = (data.aliases as string[]) ?? existing.aliases;
  data.searchKey = buildSearchKey(name, aliases);

  await prisma.serviceLocation.update({ where: { id }, data });

  await recordAudit({
    entityType: "location",
    entityId: id,
    entityLabel: name,
    action: data.active === false ? "LOCATION_DEACTIVATED" : "LOCATION_EDITED",
    actor: user,
    reason: Object.keys(data).filter((k) => k !== "searchKey").join(", "),
  });

  return NextResponse.json({ ok: true });
}
