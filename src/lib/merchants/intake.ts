import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/utils";
import { buildSearchKey } from "@/lib/locations/normalize";
import { nearestZone, distanceKm } from "@/lib/orders/pricing";
import { detectPlatform } from "@/lib/merchants/social";
import type { MerchantCategory, Prisma } from "@prisma/client";

/**
 * Taking a merchant into the catalogue, from wherever they came.
 *
 * Three doors lead here — a merchant filling in their own page, the owner
 * pasting a list they have personally checked, and a dispatcher adding one by
 * hand — and all three need the same things done: the phone normalized to the
 * form the WhatsApp links use, the name indexed for fuzzy search, the pin
 * resolved to a zone, and a duplicate folded into the existing row instead of
 * quietly becoming a second entry for the same shop.
 *
 * The duplicate rule matters most. The map import failed partly because nothing
 * reconciled two records of the same place, and a rider sent to the wrong one of
 * two "Boulangerie Fontana" is a failed delivery.
 */

/** Places further than this from any zone centroid are outside what we serve. */
const MAX_ZONE_DISTANCE_KM = 12;

export interface MerchantIntake {
  merchantName: string;
  category: MerchantCategory;
  whatsappNumber: string;
  phone?: string | null;
  address?: string | null;
  neighbourhood?: string | null;
  landmark?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  openingHours?: string | null;
  nightOpen?: boolean;
  open24h?: boolean;
  socialUrl?: string | null;
  logoUrl?: string | null;
  notes?: string | null;
  /** Set when the person adding it is vouching for the merchant themselves. */
  verified?: boolean;
  source: "admin" | "social" | "signup" | "list";
  products?: { name: string; priceXaf: number | null }[];
}

export interface IntakeResult {
  id: string;
  merchantName: string;
  created: boolean;
  /** Why a row was skipped, when it was. */
  skipped?: string;
}

/** Resolve a pin to a zone, refusing anything implausibly far from the city. */
async function resolveZone(lat: number | null | undefined, lng: number | null | undefined) {
  if (lat == null || lng == null) return null;
  const zones = await prisma.zone.findMany({
    where: { active: true },
    select: { id: true, zoneName: true, tier: true, feeXaf: true, centroidLat: true, centroidLng: true },
  });
  const nearest = nearestZone(lat, lng, zones);
  if (!nearest || nearest.centroidLat == null || nearest.centroidLng == null) return null;
  return distanceKm(lat, lng, nearest.centroidLat, nearest.centroidLng) <= MAX_ZONE_DISTANCE_KM
    ? nearest
    : null;
}

/**
 * Find the row this intake is really about: the same phone number first, then
 * the same name. A phone number is the strongest identity we have — two shops
 * do not share one — while two genuinely different branches can share a name,
 * so a name match only counts when there is no location to tell them apart.
 */
async function findExisting(name: string, phone: string, lat?: number | null, lng?: number | null) {
  if (phone) {
    const byPhone = await prisma.merchant.findFirst({
      where: { OR: [{ whatsappNumber: phone }, { phone }] },
    });
    if (byPhone) return byPhone;
  }

  const sameName = await prisma.merchant.findMany({
    where: { merchantName: { equals: name, mode: "insensitive" } },
  });
  if (sameName.length === 0) return null;
  if (lat == null || lng == null) return sameName[0];

  // Same name and within a few hundred metres: the same shop. Same name far
  // away: a different branch, which deserves its own row and its own pin.
  return (
    sameName.find(
      (m) =>
        m.latitude != null &&
        m.longitude != null &&
        distanceKm(lat, lng, m.latitude, m.longitude) < 0.4
    ) ?? null
  );
}

export async function intakeMerchant(input: MerchantIntake): Promise<IntakeResult> {
  const name = input.merchantName.trim();
  const whatsapp = input.whatsappNumber ? normalizePhone(input.whatsappNumber) : "";
  const social = input.socialUrl ? detectPlatform(input.socialUrl) : null;
  const zone = await resolveZone(input.latitude, input.longitude);

  const base: Prisma.MerchantUncheckedCreateInput = {
    merchantName: name,
    category: input.category,
    whatsappNumber: whatsapp,
    phone: input.phone?.trim() ? normalizePhone(input.phone) : null,
    // Null rather than invented. This used to fall back to the quartier plus
    // "Yaoundé" — and, for a merchant who gave no quartier either, to the
    // literal address "Yaoundé", which is not an address and would have been
    // read as one by a rider. It only existed because the column was NOT NULL.
    address: input.address?.trim() || null,
    neighbourhood: input.neighbourhood?.trim() || null,
    landmark: input.landmark?.trim() || null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    zoneId: zone?.id ?? null,
    openingHours: input.openingHours?.trim() || null,
    nightOpen: input.nightOpen ?? true,
    open24h: input.open24h ?? false,
    socialUrl: social?.url ?? null,
    socialPlatform: social?.platform ?? null,
    logoUrl: input.logoUrl?.trim() || null,
    notes: input.notes?.trim() || null,
    searchKey: buildSearchKey(name, []),
    source: input.source,
    verified: input.verified ?? false,
    active: true,
    lastSeenActiveAt: new Date(),
    ...(input.verified ? { lastConfirmedAt: new Date() } : {}),
  };

  const existing = await findExisting(name, whatsapp, input.latitude, input.longitude);

  if (existing) {
    // Never downgrade a merchant a human already approved, and never blank a
    // detail someone corrected by hand with an empty field from a new form.
    const patch: Prisma.MerchantUncheckedUpdateInput = {
      lastSeenActiveAt: new Date(),
      verified: existing.verified || (input.verified ?? false),
    };
    for (const key of [
      "phone",
      "address",
      "neighbourhood",
      "landmark",
      "latitude",
      "longitude",
      "zoneId",
      "openingHours",
      "socialUrl",
      "socialPlatform",
      "logoUrl",
      "notes",
    ] as const) {
      const next = base[key];
      if (next != null && next !== "" && (existing[key] == null || existing[key] === "")) {
        (patch as Record<string, unknown>)[key] = next;
      }
    }
    if (!existing.whatsappNumber && whatsapp) patch.whatsappNumber = whatsapp;
    if (input.verified) patch.lastConfirmedAt = new Date();

    await prisma.merchant.update({ where: { id: existing.id }, data: patch });
    await addProducts(existing.id, input.products, input.source);
    return { id: existing.id, merchantName: existing.merchantName, created: false };
  }

  const merchant = await prisma.merchant.create({ data: base });
  await addProducts(merchant.id, input.products, input.source);
  return { id: merchant.id, merchantName: merchant.merchantName, created: true };
}

/** Prices, skipping any the merchant already has under the same name. */
async function addProducts(
  merchantId: string,
  products: MerchantIntake["products"],
  source: string
): Promise<void> {
  if (!products?.length) return;
  const existing = await prisma.merchantProduct.findMany({
    where: { merchantId },
    select: { name: true },
  });
  const seen = new Set(existing.map((p) => p.name.trim().toLowerCase()));

  for (const p of products.slice(0, 10)) {
    const name = p.name?.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    await prisma.merchantProduct.create({
      data: {
        merchantId,
        name,
        priceXaf: p.priceXaf != null && p.priceXaf > 0 ? Math.round(p.priceXaf) : null,
        source,
      },
    });
  }
}
