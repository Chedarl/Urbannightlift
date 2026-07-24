import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scoreMatch } from "@/lib/locations/normalize";
import { isPlusCode, decodePlusCode } from "@/lib/locations/plusCode";

export interface LocationResult {
  id: string;
  primaryName: string;
  neighbourhood: string;
  arrondissement: string;
  landmark: string | null;
  latitude: number;
  longitude: number;
  plusCode: string | null;
  serviceStatus: string;
  source: "local" | "osm" | "pluscode";
}

const PRIORITY_STATUSES = new Set(["PRIORITY"]);

/**
 * GET /api/locations/search?q=…
 * Combined ranked results: local Urban Night Lift catalogue first (fuzzy,
 * accent/hyphen-insensitive, Biyem-Assi/Yaoundé VI prioritized), a Plus Code if
 * the query is one, then OpenStreetMap (Nominatim) as a secondary source.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const results: LocationResult[] = [];

  // 1) Plus Code
  if (isPlusCode(q)) {
    const p = decodePlusCode(q);
    if (p) {
      results.push({
        id: `plus:${q}`,
        primaryName: q.toUpperCase(),
        neighbourhood: "Plus Code",
        arrondissement: "YAOUNDE_PERIPHERY",
        landmark: null,
        latitude: p.lat,
        longitude: p.lng,
        plusCode: q.toUpperCase(),
        serviceStatus: "REVIEW_REQUIRED",
        source: "pluscode",
      });
    }
  }

  // 2) Local catalogue (fuzzy + ranked)
  const locs = await prisma.serviceLocation.findMany({ where: { active: true } });
  const scored = locs
    .map((l) => {
      let score = scoreMatch(q, l.primaryName, l.aliases);
      if (score > 0) {
        if (PRIORITY_STATUSES.has(l.serviceStatus)) score += 8; // Biyem-Assi priority boost
        if (l.arrondissement === "YAOUNDE_VI") score += 4;
        score += Math.min(l.popularityRank, 100) * 0.05;
      }
      return { l, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  for (const { l } of scored) {
    results.push({
      id: l.id,
      primaryName: l.primaryName,
      neighbourhood: l.neighbourhood,
      arrondissement: l.arrondissement,
      landmark: l.landmark,
      latitude: l.latitude,
      longitude: l.longitude,
      plusCode: l.plusCode,
      serviceStatus: l.serviceStatus,
      source: "local",
    });
  }

  // 3) OpenStreetMap fallback (bounded to Yaoundé) when local results are thin
  if (scored.length < 5) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3500);
      const url =
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q + " Yaoundé")}` +
        `&countrycodes=cm&viewbox=11.35,4.00,11.65,3.75&bounded=1&limit=5&accept-language=fr`;
      const res = await fetch(url, {
        headers: { "User-Agent": "UrbanNightLift/1.0 (locations)", Accept: "application/json" },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = (await res.json()) as { display_name: string; lat: string; lon: string; place_id: number }[];
        const seen = new Set(results.map((r) => `${r.latitude.toFixed(3)},${r.longitude.toFixed(3)}`));
        for (const d of data) {
          const lat = Number(d.lat);
          const lng = Number(d.lon);
          const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const name = d.display_name.split(",").slice(0, 2).join(",").trim();
          results.push({
            id: `osm:${d.place_id}`,
            primaryName: name,
            neighbourhood: d.display_name.split(",")[1]?.trim() ?? "Yaoundé",
            arrondissement: "YAOUNDE_PERIPHERY",
            landmark: null,
            latitude: lat,
            longitude: lng,
            plusCode: null,
            serviceStatus: "REVIEW_REQUIRED",
            source: "osm",
          });
        }
      }
    } catch {
      // OSM optional — local catalogue is the primary source
    }
  }

  return NextResponse.json({ results });
}
