import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scoreMatch } from "@/lib/locations/normalize";
import { distanceKm } from "@/lib/orders/pricing";
import { yaoundeHour } from "@/lib/orders/tonight";
import type { MerchantCategory } from "@prisma/client";

/**
 * GET /api/merchants/search?q=&category=&lat=&lng=
 *
 * Who a customer can order from, ranked. Only merchants a human has verified
 * appear here — the catalogue holds hundreds of places imported from
 * OpenStreetMap, and sending a rider to one nobody has called is exactly the
 * failure this whole feature exists to stop.
 *
 * Uses the same fuzzy matcher as the location search, so "boulangerie",
 * "Boulangérie" and "boulangeri" all find the same shop.
 */

export interface MerchantResult {
  id: string;
  merchantName: string;
  category: MerchantCategory;
  subcategory: string | null;
  neighbourhood: string | null;
  address: string;
  landmark: string | null;
  latitude: number | null;
  longitude: number | null;
  zoneId: string | null;
  openingHours: string | null;
  openNow: boolean;
  open24h: boolean;
  onDutyTonight: boolean;
  phone: string | null;
  photoUrl: string | null;
  productCount: number;
  distanceKm: number | null;
}

const CATEGORIES: MerchantCategory[] = ["FOOD", "PHARMACY", "GROCERY", "GENERAL_STORE", "OTHER"];

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim();
  const category = CATEGORIES.find((c) => c === params.get("category")) ?? null;
  // Number(null) is 0, so a missing coordinate would silently become the point
  // (0, 0) in the Gulf of Guinea and rank every merchant by its distance from
  // there. Read the raw strings and require both.
  const rawLat = params.get("lat");
  const rawLng = params.get("lng");
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  const hasPoint = Boolean(rawLat) && Boolean(rawLng) && Number.isFinite(lat) && Number.isFinite(lng);

  const merchants = await prisma.merchant.findMany({
    where: {
      verified: true,
      active: true,
      acceptingOrders: true,
      ...(category ? { category } : {}),
    },
    select: {
      id: true,
      merchantName: true,
      category: true,
      subcategory: true,
      neighbourhood: true,
      address: true,
      landmark: true,
      latitude: true,
      longitude: true,
      zoneId: true,
      openingHours: true,
      nightOpen: true,
      open24h: true,
      phone: true,
      whatsappNumber: true,
      photoUrl: true,
      aliases: true,
      popularityRank: true,
      _count: { select: { products: { where: { available: true } } } },
    },
  });

  // Tonight's pharmacie de garde. The duty rotates weekly, so it is a date
  // range rather than a flag on the pharmacy itself.
  const now = new Date();
  const onDuty = new Set(
    (
      await prisma.pharmacyDuty.findMany({
        where: { startsOn: { lte: now }, endsOn: { gte: now } },
        select: { merchantId: true },
      })
    ).map((d) => d.merchantId)
  );

  const hour = yaoundeHour(now);
  const isNight = hour >= 18 || hour < 6;

  const scored = merchants
    .map((m) => {
      // An empty query is a browse, not a search: everything stays in, ranked
      // by how useful it is right now.
      let score = q.length >= 2 ? scoreMatch(q, m.merchantName, m.aliases) : 1;
      if (score <= 0) return null;

      const openNow = m.open24h || (isNight && m.nightOpen);
      if (openNow) score += 12;
      if (onDuty.has(m.id)) score += 20; // a pharmacy on duty tonight is the answer
      if (m._count.products > 0) score += 6; // we know their prices
      score += Math.min(m.popularityRank, 100) * 0.05;

      let d: number | null = null;
      if (hasPoint && m.latitude != null && m.longitude != null) {
        d = distanceKm(lat, lng, m.latitude, m.longitude);
        score += Math.max(0, 10 - d); // nearer is better, but never decisive
      }

      const result: MerchantResult = {
        id: m.id,
        merchantName: m.merchantName,
        category: m.category,
        subcategory: m.subcategory,
        neighbourhood: m.neighbourhood,
        address: m.address,
        landmark: m.landmark,
        latitude: m.latitude,
        longitude: m.longitude,
        zoneId: m.zoneId,
        openingHours: m.openingHours,
        openNow,
        open24h: m.open24h,
        onDutyTonight: onDuty.has(m.id),
        phone: m.phone?.trim() || m.whatsappNumber?.trim() || null,
        photoUrl: m.photoUrl,
        productCount: m._count.products,
        distanceKm: d,
      };
      return { result, score };
    })
    .filter((x): x is { result: MerchantResult; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  return NextResponse.json({ results: scored.map((s) => s.result) });
}
