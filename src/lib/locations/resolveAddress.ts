import "server-only";

import { prisma } from "@/lib/prisma";
import { scoreMatch, normalizeTokens } from "@/lib/locations/normalize";
import { nearestZone } from "@/lib/orders/pricing";

/**
 * Best-effort geocoding for orders whose location was typed as free text.
 *
 * When a customer types an address instead of picking one from the picker, the
 * order is stored with no coordinates — which is why the live tracking map had
 * nothing to draw and the delivery fee came out null. This recovers coordinates
 * from the text using only assets we already own:
 *
 *   1. the seeded Yaoundé ServiceLocation catalogue (exact / alias / fuzzy), then
 *   2. OpenStreetMap Nominatim, bounded to Yaoundé.
 *
 * No API key, no third-party AI, and no customer data leaves the server beyond
 * the place name itself. Every attempt is logged so we can measure how much of
 * the problem this actually solves before considering anything paid.
 */

export type GeoSource = "CATALOGUE" | "OSM";

export interface ResolvedAddress {
  latitude: number;
  longitude: number;
  source: GeoSource;
  /** 0–1. Below ~0.6 the dispatcher should confirm before trusting it. */
  confidence: number;
  matchedName: string;
  zoneId: string | null;
}

/** Yaoundé bounding box — keeps Nominatim from returning a same-named town elsewhere. */
const YAOUNDE_VIEWBOX = "11.35,4.00,11.65,3.75";
const OSM_TIMEOUT_MS = 3500;

/** Words that carry no place information and only dilute the match. */
const STOP_WORDS = new Set([
  "a", "au", "aux", "the", "at", "in", "near", "pres", "derriere", "behind", "cote",
  "face", "devant", "chez", "vers", "de", "du", "des", "la", "le", "les", "et", "and",
  "rue", "street", "avenue", "quartier", "carrefour", "yaounde", "cameroun", "cameroon",
]);

function meaningfulTokens(text: string): string[] {
  return normalizeTokens(text)
    .split(" ")
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

/**
 * Free-text like "behind the Total station at Rond-Point Express Biyem-Assi"
 * won't match the catalogue whole, so we also try each meaningful token and
 * keep the strongest hit.
 */
async function matchCatalogue(text: string): Promise<ResolvedAddress | null> {
  const locations = await prisma.serviceLocation.findMany({
    where: { active: true },
    select: {
      id: true,
      primaryName: true,
      aliases: true,
      latitude: true,
      longitude: true,
      zoneId: true,
      popularityRank: true,
      serviceStatus: true,
    },
  });
  if (locations.length === 0) return null;

  const candidates = [text, ...meaningfulTokens(text)];
  let best: { score: number; loc: (typeof locations)[number] } | null = null;

  for (const candidate of candidates) {
    // A whole-string hit is worth more than a single-token hit.
    const isWholeString = candidate === text;
    for (const loc of locations) {
      let score = scoreMatch(candidate, loc.primaryName, loc.aliases);
      if (score <= 0) continue;
      if (!isWholeString) score *= 0.75;
      score += Math.min(loc.popularityRank, 100) * 0.05;
      if (loc.serviceStatus === "PRIORITY") score += 4;
      if (!best || score > best.score) best = { score, loc };
    }
  }

  // scoreMatch's weakest useful signal is a "contains" hit at 30.
  if (!best || best.score < 30) return null;

  return {
    latitude: best.loc.latitude,
    longitude: best.loc.longitude,
    source: "CATALOGUE",
    // 100 = exact name match. Cap at 0.95: text we had to guess at is never certain.
    confidence: Math.min(0.95, best.score / 100),
    matchedName: best.loc.primaryName,
    zoneId: best.loc.zoneId,
  };
}

/** OpenStreetMap, bounded to Yaoundé. Free; failures are non-fatal by design. */
async function matchNominatim(text: string): Promise<ResolvedAddress | null> {
  const query = meaningfulTokens(text).join(" ") || text;
  if (query.trim().length < 3) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OSM_TIMEOUT_MS);
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(`${query} Yaoundé`)}` +
      `&countrycodes=cm&viewbox=${YAOUNDE_VIEWBOX}&bounded=1&limit=1&accept-language=fr`;
    const res = await fetch(url, {
      headers: { "User-Agent": "UrbanNightLift/1.0 (order geocoding)", Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    const hit = data[0];
    if (!hit) return null;

    const latitude = Number(hit.lat);
    const longitude = Number(hit.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return {
      latitude,
      longitude,
      source: "OSM",
      // A bounded OSM hit is plausible, not authoritative — always dispatcher-checkable.
      confidence: 0.5,
      matchedName: hit.display_name.split(",").slice(0, 2).join(",").trim(),
      zoneId: null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves free text to coordinates, filling in the zone from the coordinates
 * when the catalogue didn't already supply one. Returns null when nothing
 * credible was found — callers must treat that as "no coordinates", never as an
 * error, so an order can always still be placed.
 */
export async function resolveAddress(text: string): Promise<ResolvedAddress | null> {
  const trimmed = (text ?? "").trim();
  if (trimmed.length < 3) return null;

  let resolved = await matchCatalogue(trimmed);
  if (!resolved) resolved = await matchNominatim(trimmed);

  if (resolved && !resolved.zoneId) {
    // nearestZone takes the full ZoneWithCentroid shape and skips null centroids itself.
    const zones = await prisma.zone.findMany({
      where: { active: true, centroidLat: { not: null }, centroidLng: { not: null } },
      select: { id: true, zoneName: true, tier: true, feeXaf: true, centroidLat: true, centroidLng: true },
    });
    const zone = nearestZone(resolved.latitude, resolved.longitude, zones);
    if (zone) resolved.zoneId = zone.id;
  }

  // Fire-and-forget measurement: how much of the free-text problem this covers.
  prisma.addressResolutionLog
    .create({
      data: {
        rawText: trimmed.slice(0, 300),
        resolved: resolved != null,
        source: resolved?.source ?? null,
        confidence: resolved?.confidence ?? null,
        matchedName: resolved?.matchedName ?? null,
      },
    })
    .catch(() => {});

  return resolved;
}
